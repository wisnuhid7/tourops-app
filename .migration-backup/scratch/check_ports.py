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
        "sudo ss -tulpn | grep -E ':80|:443'",
        "docker ps -a",
        "find / -name nginx.conf 2>/dev/null",
        "sudo nginx -T 2>/dev/null || echo 'nginx -T failed'"
    ]
    
    for cmd in commands:
        print(f"\n=== Running: {cmd} ===")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        
        # We might need to input sudo password if prompted, but devteam might have passwordless sudo or we can try.
        # Since paramiko exec_command doesn't handle interactive automatically, let's see.
        # If it asks for sudo password, it might hang or print to stderr.
        # Let's check if we can pass password if it prompts, or just read output.
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        if out:
            print(out)
        if err:
            print("Stderr:", err)
            
    ssh.close()

if __name__ == "__main__":
    run()
