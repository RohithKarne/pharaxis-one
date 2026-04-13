// PM2 Ecosystem Config — Pharaxis One
// max_memory_restart: PM2 auto-restarts a backend if it exceeds this limit
// instead of letting it grow and crash the whole EC2 instance.

module.exports = {
  apps: [
    {
      name: 'mims',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/medical-affairs/mims/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'cp-portal',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/medical-affairs/cp-portal/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'ieg',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/medical-affairs/ieg/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'publications',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/medical-affairs/publications/backend',
      max_memory_restart: '400M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'safety',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/safety/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'vault',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/vault/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'ai-agent',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/ai-agent/backend',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    },
    {
      name: 'qms',
      script: 'server.js',
      cwd: '/home/ubuntu/pharaxis/apps/qms/backend',
      node_args: '--env-file=.env',
      max_memory_restart: '200M',
      restart_delay: 3000,
      env: { NODE_ENV: 'production' }
    }
  ]
}
