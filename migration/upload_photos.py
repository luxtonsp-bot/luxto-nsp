#!/usr/bin/env python3
"""
Placeholder script for uploading member photos from Drive to Firebase Storage.
"""

def main():
    print("Photo upload placeholder.")
    # TODO:
    # 1. Initialize Firebase Admin SDK.
    # 2. For each member, download photo from Drive (using Drive API or gspread?).
    # 3. Upload to bucket under memberPhotos/{uid}.jpg.
    # 4. Make file publicly readable (or use signed URLs; but we want public read for profile photos).
    # 5. Update member document with download URL.
    pass

if __name__ == "__main__":
    main()