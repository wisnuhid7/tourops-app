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
        "curl -i http://localhost:5022/",
        "curl -i http://localhost:5022/my-bookings/9f096297-3b67-46d7-a522-336ce9c8b032",
        "curl -s -o /dev/null -w '%{http_code}' http://localhost:5022/assets/index-fGLeNVUS.js || echo 'curl failed'"
    ]
    
    for cmd in commands:
        print(f"\n=== Running: {cmd} ===")
        stdin, stdout, stderr = ssh.exec_command(cmd)
        out = stdout.read().decode('utf-8', 'replace')
        err = stderr.read().decode('utf-8', 'replace')
        if out:
            print(out[:1000] + ("\n... [truncated]" if len(out) > 1000 else ""))
        if err:
            print("Stderr:", err)
            
    ssh.close()

if __name__ == "__main__":
    run()
