import paramiko
import sys

# Memastikan teks output dari server (termasuk karakter spesial dari Docker) bisa terbaca tanpa error
sys.stdout.reconfigure(encoding='utf-8')

def run():
    host = "88.99.192.160"
    port = 2235
    username = "devteam"
    password = "devteam73Sleep*"
    
    print("Menyambungkan ke server...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password)
    print("Berhasil tersambung!")
    
    commands = [
        "cd tourops-src && git pull",
        "cd tourops-src && docker build -t tourops:latest .",
        "cd tourops && docker compose down",
        "cd tourops && docker compose up -d"
    ]
    
    for cmd in commands:
        print(f"\nMenjalankan: {cmd}")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        while True:
            line = stdout.readline()
            if not line:
                break
            print(line, end="")
            
        err = stderr.read().decode('utf-8', 'replace')
        if err:
            print(f"Stderr: {err}")
        print(f"Status Selesai: {stdout.channel.recv_exit_status()}")
    
    ssh.close()
    print("\nProses Deploy Selesai!")

if __name__ == "__main__":
    run()
