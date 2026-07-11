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
        "ps aux | grep -E 'cloudflared|tunnel|nginx|caddy|apache'",
        "systemctl list-units --type=service | grep -E 'cloudflare|tunnel|nginx|caddy|apache'",
        "sudo journalctl -u cloudflared -n 50 --no-pager 2>/dev/null || echo 'no cloudflared service logs'",
        "sudo systemctl status cloudflared 2>/dev/null || echo 'no cloudflared systemd service'"
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
