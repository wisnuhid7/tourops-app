import json

def run():
    path = r"C:\Users\arta\.gemini\antigravity-ide\brain\9547365b-f0b2-4cd6-89d2-1a1028a9b39d\.system_generated\logs\transcript.jsonl"
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            data = json.loads(line)
            if data.get('step_index') == 1241:
                content = data.get('content', '')
                with open('scratch/log_extracted.txt', 'w', encoding='utf-8') as out:
                    out.write(content)
                print("Successfully extracted log to scratch/log_extracted.txt!")
                return

if __name__ == "__main__":
    run()
