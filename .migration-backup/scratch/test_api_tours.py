import paramiko
import json

def run():
    host = "88.99.192.160"
    port = 2235
    username = "devteam"
    password = "devteam73Sleep*"
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(host, port, username, password)
    
    login_cmd = "curl -s -c cookies.txt -H \"Content-Type: application/json\" -d '{\"username\":\"superadmin1\",\"password\":\"password123\"}' http://localhost:5022/api/auth/login"
    stdin, stdout, stderr = ssh.exec_command(login_cmd)
    stdout.read()
    
    tours_cmd = "curl -s -b cookies.txt http://localhost:5022/api/tours"
    stdin, stdout, stderr = ssh.exec_command(tours_cmd)
    tours_res = stdout.read().decode('utf-8')
    
    try:
        data = json.loads(tours_res)
        print("Tours Count:", len(data))
        for idx, t in enumerate(data):
            print(f"Index {idx}: ID={t.get('id')}, Title={t.get('title')}")
    except Exception as e:
        print("Error:", e)
        
    ssh.close()

if __name__ == "__main__":
    run()
