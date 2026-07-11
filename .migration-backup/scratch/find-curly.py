with open("client/src/pages/admin/tour-generator.tsx", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines):
    line_num = idx + 1
    if line_num >= 400 and "{" in line and "}" in line:
        # Check if it's inside JSX
        clean = line.strip()
        if not clean.startswith("//") and not clean.startswith("const") and not clean.startswith("let") and not clean.startswith("function"):
            print(f"{line_num}: {clean}")
