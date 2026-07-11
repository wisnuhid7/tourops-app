import os

def scan_file(filepath):
    with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
        
    lines = content.split('\n')
    issues = []
    
    for i, line in enumerate(lines):
        if line.strip().startswith('//') or line.strip().startswith('*'):
            continue
            
        if '?.' in line:
            idx = 0
            while True:
                idx = line.find('?.', idx)
                if idx == -1:
                    break
                
                rest = line[idx+2:]
                next_dot = rest.find('.')
                if next_dot != -1:
                    if next_dot == 0 or rest[next_dot-1] != '?':
                        issues.append((i+1, line.strip()))
                        break
                idx += 2
                
    return issues

def main():
    client_dir = r"d:\INFORMATICS\FREELANCE\tourops\client\src"
    all_issues = {}
    for root, dirs, files in os.walk(client_dir):
        for file in files:
            if file.endswith(('.ts', '.tsx')):
                filepath = os.path.join(root, file)
                issues = scan_file(filepath)
                if issues:
                    rel_path = os.path.relpath(filepath, client_dir)
                    all_issues[rel_path] = issues
                    
    with open(r"d:\INFORMATICS\FREELANCE\tourops\scratch\unsafe_chains_report.txt", "w", encoding="utf-8") as f:
        for file, issues in all_issues.items():
            f.write(f"\nFile: {file}\n")
            for line_num, line_content in issues:
                f.write(f"  Line {line_num}: {line_content}\n")

if __name__ == "__main__":
    main()
