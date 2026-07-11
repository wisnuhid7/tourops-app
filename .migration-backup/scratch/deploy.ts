// @ts-nocheck
import { Client } from "ssh2";

const conn = new Client();

console.log("🚀 Starting deployment to biblicaljourney.net with Password + Keyboard Interactive Auth...");

conn.on("ready", () => {
  console.log("✅ SSH connection established!");
  
  conn.shell((err, stream) => {
    if (err) {
      console.error("❌ Shell error:", err);
      process.exit(1);
    }
    
    stream.on("close", () => {
      console.log("\n✅ Shell stream closed.");
      conn.end();
      process.exit(0);
    });

    stream.on("data", (data: Buffer) => {
      process.stdout.write(data.toString());
    });

    // Write commands one after another
    stream.write("cd ~/tourops-src\n");
    stream.write("git pull origin main\n");
    stream.write("docker build -t tourops:latest .\n");
    stream.write("cd ~/tourops\n");
    stream.write("docker compose down\n");
    stream.write("docker compose up -d\n");
    stream.write("exit\n");
  });
});

conn.on("keyboard-interactive", (name, instructions, instructionsLang, prompts, finish) => {
  console.log("⌨️ Keyboard interactive authentication prompted. Responding with password...");
  finish(["devteam73Sleep*"]);
});

conn.on("error", (err) => {
  console.error("❌ Connection error:", err.message);
  process.exit(1);
});

conn.connect({
  host: "88.99.192.160",
  port: 2235,
  username: "devteam",
  password: "devteam73Sleep*",
  tryKeyboard: true, // Enables keyboard-interactive authentication fallback
});
