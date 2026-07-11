import paramiko
import sys

def main():
    host = "88.99.192.160"
    port = 2235
    username = "devteam"
    password = "devteam73Sleep*"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password)
    
    # We retrieve the last 150 lines of logs
    cmd = "cd tourops && docker compose logs --tail=150"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    print("STDOUT:")
    print(stdout.read().decode('utf-8', 'replace'))
    
    print("\nSTDERR:")
    print(stderr.read().decode('utf-8', 'replace'))
    
    ssh.close()

if __name__ == "__main__":
    main()
