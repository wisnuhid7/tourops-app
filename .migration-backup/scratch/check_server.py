import paramiko
import sys

def run():
    host = "88.99.192.160"
    port = 2235
    username = "devteam"
    password = "devteam73Sleep*"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password)
    
    commands = [
        "docker ps",
        "docker compose ps",
        "ls -la",
        "ls -la tourops",
        "ls -la tourops-src",
        "cat /etc/nginx/sites-enabled/default || cat /etc/nginx/nginx.conf || echo 'no nginx in /etc/nginx'",
        "ps aux | grep nginx",
        "curl -I http://localhost"
    ]
    
    for cmd in commands:
        print(f"\n=== Running: {cmd} ===")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        if out:
            print(out)
        if err:
            print("Stderr:", err)
            
    ssh.close()

if __name__ == "__main__":
    run()
