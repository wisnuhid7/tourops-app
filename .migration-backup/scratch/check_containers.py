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
        "docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}'",
        "docker network ls",
        "find /home/devteam/ -name '*nginx*.conf' -o -name '*default' 2>/dev/null",
        "docker inspect tour_ops_app | grep -i port",
        "docker inspect tour_ops_app | grep -i env -A 10"
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
