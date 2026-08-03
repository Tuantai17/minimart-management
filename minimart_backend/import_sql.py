import subprocess
import os

sql_file = r"E:\MINIMART\minimart.sql"
db_name = "minimart_db"
user = "postgres"
password = "123456"
host = "127.0.0.1"
port = "5432"

try:
    # Try finding psql from default postgres paths if it's not in PATH
    pg_paths = [
        r"C:\Program Files\PostgreSQL\16\bin\psql.exe",
        r"C:\Program Files\PostgreSQL\15\bin\psql.exe",
        r"C:\Program Files\PostgreSQL\14\bin\psql.exe",
        r"C:\Program Files\PostgreSQL\13\bin\psql.exe"
    ]
    
    psql_exe = "psql" # Default
    for path in pg_paths:
        if os.path.exists(path):
            psql_exe = f'"{path}"'
            break
            
    env = os.environ.copy()
    env["PGPASSWORD"] = password
    
    cmd = f'{psql_exe} -U {user} -h {host} -p {port} -d {db_name} -f "{sql_file}"'
    print(f"Running: {cmd}")
    
    process = subprocess.Popen(cmd, env=env, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    stdout, stderr = process.communicate()
    
    if process.returncode == 0:
        print("Successfully imported data.")
    else:
        print(f"Error importing data. Return code: {process.returncode}")
        print(f"Stderr: {stderr}")
        
except Exception as e:
    print(f"An error occurred: {e}")
