module.exports = {
  apps: [
    {
      name: 'examkade-backend',
      script: 'dist/main.js',
      instances: 'max', // or a specific number of instances
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
