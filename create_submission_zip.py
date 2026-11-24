# create_submission_zip.py
# Packages the Socket Chat Application into a clean, executable submission zip archive
import os
import zipfile

PROJECT_ROOT = os.path.abspath(os.path.dirname(__file__))
ZIP_FILENAME = os.path.join(PROJECT_ROOT, "socket-chat-application.zip")

EXCLUDE_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".gemini"
}

EXCLUDE_EXTENSIONS = {
    ".pyc",
    ".log",
    ".o"
}

EXCLUDE_FILES = {
    "socket-chat-application.zip",
    "patent.zip",
    "create_submission_zip.py",
    "build_err.txt"
}

def should_exclude(rel_path):
    parts = rel_path.replace("\\", "/").split("/")
    for part in parts:
        if part in EXCLUDE_DIRS:
            return True
        if part.startswith("err") and part.endswith(".txt"):
            return True
        if part in EXCLUDE_FILES:
            return True
    
    _, ext = os.path.splitext(rel_path)
    if ext in EXCLUDE_EXTENSIONS:
        return True
    
    return False

def make_submission_zip():
    print(f"Creating submission zip: {ZIP_FILENAME}")
    
    if os.path.exists(ZIP_FILENAME):
        os.remove(ZIP_FILENAME)
        
    file_count = 0
    total_uncompressed_bytes = 0

    with zipfile.ZipFile(ZIP_FILENAME, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zipf:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            # Prune excluded directories
            dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
            
            for f in files:
                abs_path = os.path.join(root, f)
                rel_path = os.path.relpath(abs_path, PROJECT_ROOT)
                
                if should_exclude(rel_path):
                    continue
                
                # Archive under folder name 'socket-chat-application/' so it unzips into a clean root folder
                archive_name = os.path.join("socket-chat-application", rel_path).replace("\\", "/")
                zipf.write(abs_path, archive_name)
                
                file_count += 1
                total_uncompressed_bytes += os.path.getsize(abs_path)

    zip_size_bytes = os.path.getsize(ZIP_FILENAME)
    zip_size_mb = zip_size_bytes / (1024 * 1024)
    uncompressed_mb = total_uncompressed_bytes / (1024 * 1024)

    print("========================================================")
    print("        SUBMISSION ZIP PACKAGE CREATED SUCCESSFULLY     ")
    print("========================================================")
    print(f"Archive Path     : {ZIP_FILENAME}")
    print(f"Total Files Added: {file_count}")
    print(f"Uncompressed Size: {uncompressed_mb:.2f} MB")
    print(f"Compressed Size  : {zip_size_mb:.2f} MB ({zip_size_bytes:,} bytes)")
    print(f"Root Folder Name : socket-chat-application/")
    print("========================================================")

if __name__ == "__main__":
    make_submission_zip()

