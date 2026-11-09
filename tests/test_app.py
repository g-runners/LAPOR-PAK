import re
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch

from werkzeug.datastructures import MultiDict

import app as lapor_app


class LaporPakTests(unittest.TestCase):
    def setUp(self):
        lapor_app.app.config.update(TESTING=True, SECRET_KEY="test-secret")
        self.temp_dir = tempfile.TemporaryDirectory()
        lapor_app.app.config["DATA_FILE"] = Path(self.temp_dir.name) / "lapor_pak.json"
        self.client = lapor_app.app.test_client()

    def tearDown(self):
        self.temp_dir.cleanup()

    def csrf_token(self):
        response = self.client.get("/map")
        match = re.search(rb'<meta name="csrf-token" content="([^"]+)"', response.data)
        self.assertIsNotNone(match)
        return match.group(1).decode()

    def test_public_report_cannot_set_staff_status(self):
        values = lapor_app.parse_report_values(
            MultiDict({
                "title": "Jalan Berlubang",
                "location": "Jalan Mawar",
                "description": "Lubang besar membahayakan",
                "coordinates": "-6.2, 107.1",
                "status": "Selesai",
            })
        )
        self.assertEqual(values["status"], "Menunggu ditangani")
        self.assertEqual(values["severity"], "Tinggi")

    def test_coordinates_are_validated(self):
        for coordinates in ("95, 107", "NaN, 107"):
            with self.subTest(coordinates=coordinates), self.assertRaisesRegex(ValueError, "rentang"):
                lapor_app.parse_report_values(
                    MultiDict({
                        "title": "Jalan Retak",
                        "location": "Jalan Mawar",
                        "description": "Permukaan rusak",
                        "coordinates": coordinates,
                    })
                )

    def test_public_submission_starts_pending(self):
        token = self.csrf_token()
        with patch.object(lapor_app, "save_uploaded_image", return_value="photo.jpg"), patch.object(
            lapor_app, "insert_report", return_value="LP-TEST"
        ) as insert:
            response = self.client.post(
                "/api/reports",
                headers={"X-CSRF-Token": token},
                data={
                    "title": "Jalan Berlubang",
                    "location": "Jalan Mawar",
                    "description": "Lubang besar",
                    "coordinates": "-6.2, 107.1",
                    "status": "Selesai",
                    "photo": (BytesIO(b"image"), "jalan.jpg", "image/jpeg"),
                },
                content_type="multipart/form-data",
            )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(insert.call_args.args[0]["status"], "Menunggu ditangani")

    def test_public_report_requires_a_supported_damage_type(self):
        with self.assertRaisesRegex(ValueError, "Jalan Berlubang atau Jalan Retak"):
            lapor_app.parse_report_values(
                MultiDict({
                    "title": "Lubang besar",
                    "location": "Jalan Mawar",
                    "description": "Jalan rusak",
                })
            )

    def test_state_change_requires_csrf_token(self):
        response = self.client.post("/api/reports/LP-TEST/rating", json={"rating": 5})
        self.assertEqual(response.status_code, 400)

    def test_rating_rejects_non_integer_values(self):
        token = self.csrf_token()
        response = self.client.post(
            "/api/reports/LP-TEST/rating",
            headers={"X-CSRF-Token": token},
            json={"rating": True},
        )
        self.assertEqual(response.status_code, 400)

    def test_legacy_operator_routes_are_removed(self):
        for path in ("/operator", "/operator/login"):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 404)

    def test_legacy_operator_accounts_are_ignored(self):
        data_file = lapor_app.app.config["DATA_FILE"]
        data_file.write_text(
            '{"operators":[{"username":"old-account","password_hash":"unused"}],"reports":[]}',
            encoding="utf-8",
        )
        self.assertEqual(lapor_app.load_data(), {"reports": []})

    def test_map_template_renders(self):
        map_response = self.client.get("/map")
        self.assertEqual(map_response.status_code, 200)
        self.assertIn(b"report-map", map_response.data)

    def test_banner_image_is_served_by_flask(self):
        response = self.client.get("/images/banner.jpg")
        try:
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, "image/jpeg")
            self.assertTrue(response.data.startswith(b"\xff\xd8\xff"))
        finally:
            response.close()

    def test_report_data_is_persisted_and_used_by_map(self):
        values = {
            "title": "Jalan Retak",
            "location": "Jalan Mawar",
            "description": "Retak pada badan jalan",
            "latitude": -6.2,
            "longitude": 107.1,
            "severity": "Sedang",
            "status": "Menunggu ditangani",
        }
        report_id = lapor_app.insert_report(values, "photo.jpg")

        with lapor_app.app.test_request_context():
            reports = lapor_app.fetch_reports()
        self.assertEqual(reports[0]["id"], report_id)
        self.assertEqual(reports[0]["lat"], -6.2)
        self.assertEqual(reports[0]["photo"], f"/uploads/photo.jpg")
        self.assertEqual(lapor_app.fetch_statistics()["pending"], 1)

        response = self.client.get("/map")
        self.assertEqual(response.status_code, 200)
        self.assertIn(report_id.encode(), response.data)

    def test_completed_report_rating_is_saved(self):
        values = {
            "title": "Jalan Retak",
            "location": "Jalan Mawar",
            "description": "Perbaikan selesai",
            "latitude": None,
            "longitude": None,
            "severity": "Sedang",
            "status": lapor_app.STATUSES[2],
        }
        report_id = lapor_app.insert_report(values)
        token = self.csrf_token()
        response = self.client.post(
            f"/api/reports/{report_id}/rating",
            headers={"X-CSRF-Token": token},
            json={"rating": 5},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(lapor_app.fetch_reports()[0]["rating"], 5)

    def test_data_store_outage_has_explicit_response(self):
        with patch.object(
            lapor_app,
            "fetch_reports",
            side_effect=lapor_app.DataStoreError("data offline"),
        ):
            response = self.client.get("/map")
        self.assertEqual(response.status_code, 503)
        self.assertIn(b"Penyimpanan data belum dapat diakses", response.data)


if __name__ == "__main__":
    unittest.main()
