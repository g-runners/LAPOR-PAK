import json
import math
import os
import re
import secrets
import threading
import uuid
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from flask import (
    Flask,
    abort,
    jsonify,
    render_template,
    request,
    send_from_directory,
    session,
    url_for,
)
from werkzeug.utils import secure_filename

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
DATA_FILE = BASE_DIR / "data" / "lapor_pak.json"
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_IMAGE_SIZE = 5 * 1024 * 1024
STATUSES = ("Menunggu ditangani", "Dalam penanganan", "Selesai")
SEVERITIES = ("Tinggi", "Sedang", "Rendah")
PUBLIC_DAMAGE_TYPES = ("Jalan Berlubang", "Jalan Retak")

app = Flask(__name__, template_folder=str(BASE_DIR), static_folder="assets", static_url_path="/assets")
app.config.update(
    SECRET_KEY=os.getenv("SECRET_KEY") or secrets.token_hex(32),
    DATA_FILE=DATA_FILE,
    MAX_CONTENT_LENGTH=11 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
)

_DATA_LOCK = threading.RLock()


class DataStoreError(RuntimeError):
    """Raised when the JSON data store cannot be read or written."""


def load_data():
    path = Path(app.config["DATA_FILE"])
    with _DATA_LOCK:
        try:
            with path.open(encoding="utf-8") as data_file:
                data = json.load(data_file)
        except FileNotFoundError:
            return {"reports": []}
        except (OSError, json.JSONDecodeError) as error:
            raise DataStoreError("Data LAPOR PAK tidak dapat dibaca.") from error

    if not isinstance(data, dict) or not isinstance(data.get("reports"), list):
        raise DataStoreError("Format berkas data LAPOR PAK tidak valid.")
    data.pop("operators", None)
    return data


def save_data(data):
    path = Path(app.config["DATA_FILE"])
    temp_path = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    with _DATA_LOCK:
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            with temp_path.open("w", encoding="utf-8") as data_file:
                json.dump(data, data_file, ensure_ascii=False, indent=2)
                data_file.write("\n")
                data_file.flush()
                os.fsync(data_file.fileno())
            os.replace(temp_path, path)
        except (OSError, TypeError, ValueError) as error:
            if temp_path.exists():
                temp_path.unlink()
            raise DataStoreError("Data LAPOR PAK tidak dapat disimpan.") from error


def csrf_token():
    token = session.get("_csrf_token")
    if token is None:
        token = secrets.token_urlsafe(32)
        session["_csrf_token"] = token
    return token


app.jinja_env.globals["csrf_token"] = csrf_token


@app.before_request
def protect_state_changes():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        expected = session.get("_csrf_token")
        supplied = request.headers.get("X-CSRF-Token") or request.form.get("_csrf_token")
        if not expected or not supplied or not secrets.compare_digest(expected, supplied):
            abort(400, description="Token keamanan tidak valid. Muat ulang halaman lalu coba kembali.")


def classify_severity(text):
    normalized = text.lower()
    if re.search(r"\b(amblas|longsor|putus|sangat dalam|lubang besar|membahayakan|kecelakaan|parah)\b", normalized):
        return "Tinggi"
    if re.search(r"\b(lubang|retak|bergelombang|terkelupas|rusak|genangan)\b", normalized):
        return "Sedang"
    return "Rendah"


def parse_report_values(source):
    title = str(source.get("title", "")).strip()
    location = str(source.get("location", "")).strip()
    description = str(source.get("description", "")).strip()
    coordinates = str(source.get("coordinates", "")).strip()

    if not title or len(title) > 80:
        raise ValueError("Jenis kerusakan wajib diisi dan maksimal 80 karakter.")
    if title not in PUBLIC_DAMAGE_TYPES:
        raise ValueError("Pilih jenis kerusakan Jalan Berlubang atau Jalan Retak.")
    if not location or len(location) > 120:
        raise ValueError("Lokasi jalan wajib diisi dan maksimal 120 karakter.")
    if not description or len(description) > 500:
        raise ValueError("Deskripsi wajib diisi dan maksimal 500 karakter.")
    latitude = longitude = None
    if coordinates:
        parts = coordinates.split(",")
        if len(parts) != 2:
            raise ValueError("Koordinat harus berisi latitude dan longitude.")
        try:
            latitude, longitude = (float(part.strip()) for part in parts)
        except ValueError as error:
            raise ValueError("Koordinat harus berupa angka yang valid.") from error
        if not (math.isfinite(latitude) and math.isfinite(longitude) and -90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("Koordinat berada di luar rentang yang valid.")

    return {
        "title": title,
        "location": location,
        "description": description,
        "latitude": latitude,
        "longitude": longitude,
        "severity": classify_severity(title + " " + description),
        "status": STATUSES[0],
    }


def save_uploaded_image(file_storage, required=False):
    if file_storage is None or not file_storage.filename:
        if required:
            raise ValueError("Foto wajib dilampirkan.")
        return None

    extension = Path(secure_filename(file_storage.filename)).suffix.lower()
    if extension not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError("Foto harus berformat JPG, PNG, atau WebP.")
    if file_storage.mimetype not in {"image/jpeg", "image/png", "image/webp"}:
        raise ValueError("Jenis file foto tidak didukung.")

    header = file_storage.stream.read(12)
    file_storage.stream.seek(0)
    valid_image = {
        ".jpg": header.startswith(b"\xff\xd8\xff"),
        ".jpeg": header.startswith(b"\xff\xd8\xff"),
        ".png": header.startswith(b"\x89PNG\r\n\x1a\n"),
        ".webp": header.startswith(b"RIFF") and header[8:12] == b"WEBP",
    }
    if not valid_image[extension]:
        raise ValueError("Isi file tidak cocok dengan format foto yang dipilih.")

    filename = f"{uuid.uuid4().hex}{extension}"
    destination = UPLOAD_DIR / filename
    file_storage.save(destination)
    if destination.stat().st_size > MAX_IMAGE_SIZE:
        destination.unlink()
        raise ValueError("Ukuran setiap foto maksimal 5 MB.")
    return filename


def report_to_dict(row):
    created_at = row["created_at"]
    coordinates = ""
    if row["latitude"] is not None and row["longitude"] is not None:
        coordinates = f'{float(row["latitude"]):.6f}, {float(row["longitude"]):.6f}'
    return {
        "id": row["id"],
        "title": row["title"],
        "location": row["location"],
        "description": row["description"],
        "coordinates": coordinates,
        "lat": float(row["latitude"]) if row["latitude"] is not None else None,
        "lng": float(row["longitude"]) if row["longitude"] is not None else None,
        "severity": row["severity"],
        "status": row["status"],
        "photo": url_for("uploaded_file", filename=row["photo_path"]) if row["photo_path"] else "",
        "repairPhoto": url_for("uploaded_file", filename=row["repair_photo_path"]) if row["repair_photo_path"] else "",
        "rating": int(row["rating"] or 0),
        "createdAt": created_at.isoformat() if isinstance(created_at, datetime) else str(created_at),
    }


def fetch_reports():
    reports = load_data()["reports"]
    return [
        report_to_dict(report)
        for report in sorted(reports, key=lambda report: report["created_at"], reverse=True)
    ]


def fetch_statistics():
    reports = load_data()["reports"]
    return {
        "total": len(reports),
        "pending": sum(report["status"] == STATUSES[0] for report in reports),
        "processing": sum(report["status"] == STATUSES[1] for report in reports),
        "completed": sum(report["status"] == STATUSES[2] for report in reports),
    }


def insert_report(values, photo_path=None):
    report_id = "LP-" + datetime.now().strftime("%y%m%d%H%M%S") + secrets.token_hex(2).upper()
    report = {
        "id": report_id,
        **values,
        "photo_path": photo_path,
        "repair_photo_path": None,
        "rating": 0,
        "created_at": datetime.now().astimezone().isoformat(),
    }
    with _DATA_LOCK:
        data = load_data()
        data["reports"].append(report)
        save_data(data)
    return report_id


def rate_report(report_id, rating):
    with _DATA_LOCK:
        data = load_data()
        report = next((item for item in data["reports"] if item["id"] == report_id), None)
        if not report or report["status"] != STATUSES[2]:
            return False
        report["rating"] = rating
        save_data(data)
    return True


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/map")
def public_map():
    return render_template("templates/map.html", reports=fetch_reports(), csrf=csrf_token())


@app.get("/images/<path:filename>")
def image_file(filename):
    return send_from_directory(BASE_DIR / "images", filename)


@app.get("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.get("/api/reports")
def api_reports():
    return jsonify(fetch_reports())


@app.post("/api/reports")
def api_create_report():
    photo_path = None
    try:
        values = parse_report_values(request.form)
        photo_path = save_uploaded_image(request.files.get("photo"), required=True)
        report_id = insert_report(values, photo_path)
        return jsonify({"id": report_id}), 201
    except ValueError as error:
        if photo_path:
            (UPLOAD_DIR / photo_path).unlink(missing_ok=True)
        return jsonify({"error": str(error)}), 400
    except Exception:
        if photo_path:
            (UPLOAD_DIR / photo_path).unlink(missing_ok=True)
        raise


@app.post("/api/reports/<report_id>/rating")
def api_rate_report(report_id):
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Penilaian harus berupa angka 1 sampai 5."}), 400
    rating = payload.get("rating")
    if isinstance(rating, bool) or not isinstance(rating, int):
        return jsonify({"error": "Penilaian harus berupa angka 1 sampai 5."}), 400
    if rating < 1 or rating > 5:
        return jsonify({"error": "Penilaian harus berupa angka 1 sampai 5."}), 400

    if not rate_report(report_id, rating):
        return jsonify({"error": "Laporan tidak ditemukan atau belum selesai diperbaiki."}), 404
    return jsonify({"rating": rating})


@app.errorhandler(413)
def request_too_large(_error):
    return jsonify({"error": "Ukuran total unggahan foto melebihi batas 10 MB."}), 413


@app.errorhandler(DataStoreError)
def data_store_unavailable(error):
    app.logger.exception("Permintaan LAPOR PAK gagal mengakses penyimpanan JSON.")
    if request.path.startswith("/api/"):
        return jsonify({"error": str(error)}), 503
    return (
        render_template("templates/error.html"),
        503,
    )


if __name__ == "__main__":
    app.run(debug=os.getenv("FLASK_DEBUG") == "1")
