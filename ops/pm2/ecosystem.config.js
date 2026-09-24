// PM2 Ecosystem Config — Pharaxis One
// max_memory_restart: PM2 auto-restarts a backend if it exceeds this limit
// instead of letting it grow and crash the whole EC2 instance.

module.exports = {
  apps: [
    {
      name: 'mims',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/mims/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cp-portal',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/cp-portal/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    }
  ]
}
