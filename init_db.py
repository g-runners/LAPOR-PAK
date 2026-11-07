import getpass

from app import DataStoreError, create_operator
from werkzeug.security import generate_password_hash


def main():
    username = input("Nama pengguna operator baru: ").strip()
    if not username or len(username) > 80:
        raise SystemExit("Nama pengguna wajib diisi dan maksimal 80 karakter.")

    password = getpass.getpass("Kata sandi (minimal 12 karakter): ")
    if len(password) < 12:
        raise SystemExit("Kata sandi harus memiliki minimal 12 karakter.")
    confirmation = getpass.getpass("Ulangi kata sandi: ")
    if password != confirmation:
        raise SystemExit("Konfirmasi kata sandi tidak cocok.")

    try:
        create_operator(username, generate_password_hash(password))
    except ValueError as error:
        raise SystemExit("Nama pengguna operator sudah ada.") from error
    except DataStoreError as error:
        raise SystemExit(str(error)) from error
    print("Operator berhasil dibuat di penyimpanan JSON.")


if __name__ == "__main__":
    main()
