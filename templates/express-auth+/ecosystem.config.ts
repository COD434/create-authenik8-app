module.exports = {
  apps: [
    {
      name: "authenik8-app",
      script: "src/server.ts",
      instances: "max",
      interpreter:"node",
      exec_mode: "cluster",
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
