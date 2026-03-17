import sqlite3
import os

db_path = 'data/pv_14ps_live.db'

if not os.path.exists(db_path):
    print(f"Error: {db_path} not found")
    exit(1)

try:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # List tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("Tables found:")
    for t in tables:
        print(f"- {t[0]}")
        
    # Check simple schema of lecturas_live if exists
    if ('lecturas_live',) in tables:
        print("\nColumns in lecturas_live:")
        cursor.execute("PRAGMA table_info(lecturas_live);")
        cols = cursor.fetchall()
        for c in cols:
            print(f"- {c[1]} ({c[2]})")

    conn.close()
except Exception as e:
    print(f"Error: {e}")
