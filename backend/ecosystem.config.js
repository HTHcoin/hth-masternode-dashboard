// PM2 process definition — matches the Oracle VM's existing PM2-managed stack.
//   pm2 start ecosystem.config.js && pm2 save
module.exports = {
  apps: [
    {
      name: 'hth-stake-backend',
      script: 'server.js',
      cwd: __dirname,
      env_file: '.env',
      instances: 1,
      autorestart: true,
      max_memory_restart: '256M',
      env: { NODE_ENV: 'production' },
    },
  ],
};
