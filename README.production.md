# DOT Platform V0.1 - Production Deployment

## 🚀 Quick Deploy to Vercel

### Frontend Deployment

1. **Import to Vercel**:
   - Go to [vercel.com/new](https://vercel.com/new)
   - Import `github.com/crazybass81/DOT-V0.1`
   - Select `main` branch

2. **Configure Build Settings**:
   ```
   Framework Preset: Create React App
   Root Directory: frontend
   Build Command: npm run build
   Output Directory: build
   Install Command: npm install
   ```

3. **Environment Variables** (Add in Vercel Dashboard):
   ```
   REACT_APP_API_URL=https://your-backend-api.com
   REACT_APP_SOCKET_URL=wss://your-backend-api.com
   ```

### Backend Deployment (Alternative Platforms)

Since the backend requires PostgreSQL and Redis, consider these platforms:

#### Option 1: Railway
```
railway login
railway init
railway add
railway up
```

#### Option 2: Render
1. Create Web Service
2. Connect GitHub repo (main branch)
3. Set Root Directory: `backend`
4. Add PostgreSQL and Redis addons

#### Option 3: Heroku
```
heroku create dot-platform-backend
heroku addons:create heroku-postgresql:hobby-dev
heroku addons:create heroku-redis:hobby-dev
git push heroku main
```

## 📦 Docker Deployment (Full Stack)

### Using Docker Compose
```bash
# Clone and checkout main branch
git clone https://github.com/crazybass81/DOT-V0.1.git
cd DOT-V0.1
git checkout main

# Set up environment
cp .env.example .env
# Edit .env with your configuration

# Deploy with Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Configuration
Create `.env` file:
```env
# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=dot_platform

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret_key
JWT_REFRESH_SECRET=your_refresh_secret_key

# Application
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend-url.vercel.app
```

## 🌐 Production URLs

- **Frontend**: https://your-app.vercel.app
- **Backend API**: https://your-api.railway.app
- **Health Check**: https://your-api.railway.app/health

## 🔒 Security Checklist

- [ ] Change all default passwords
- [ ] Set strong JWT secrets
- [ ] Enable HTTPS/SSL
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable database backups
- [ ] Configure monitoring/alerts

## 🇰🇷 Korean Language Support

The platform fully supports Korean language with:
- UTF-8 encoding throughout
- Korean UI translations
- Korean error messages
- Multi-language support (한/영/일/중)

## 📊 Performance Requirements

- Response time: < 3 seconds
- Concurrent users: 10+ supported
- Database connections: Pooled (max 20)
- Memory usage: < 512MB per container

## 🆘 Support

For deployment issues, check:
- [Deployment Documentation](docs/deployment-validation.md)
- [GitHub Issues](https://github.com/crazybass81/DOT-V0.1/issues)

---

**Production Branch**: `main`
**Development Branch**: `003-`
**Version**: 1.0.15