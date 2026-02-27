# RealtimeHub 🚀

A full-stack social media application built to learn Redis concepts including caching, rate limiting, BullMQ queues, and Pub/Sub for real-time notifications.

## 📚 What You'll Learn

This project demonstrates:

### Redis Concepts
1. **Caching (Cache-Aside Pattern)** - Speed up database reads
2. **Rate Limiting** - Protect APIs from abuse
3. **BullMQ Job Queues** - Background processing
4. **Pub/Sub** - Real-time notifications

### Modern Web Development
- Express.js REST API design
- MongoDB data modeling
- JWT authentication
- React with hooks and context
- WebSocket with Socket.IO

---

## 🛠 Tech Stack

### Backend
- **Node.js + Express** - REST API server
- **MongoDB + Mongoose** - Document database
- **Redis** - Caching, rate limiting, queues, pub/sub
- **BullMQ** - Job queue for background processing
- **Socket.IO** - Real-time WebSocket communication
- **JWT** - Token-based authentication

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **React Router** - Client-side routing
- **Axios** - HTTP client
- **Socket.IO Client** - WebSocket client

---

## 🏗 Project Structure

```
RealtimeHub/
├── backend/
│   ├── src/
│   │   ├── config/           # Database configurations
│   │   │   ├── mongodb.js    # MongoDB connection
│   │   │   └── redis.js      # Redis connection
│   │   ├── controllers/      # Request handlers
│   │   │   ├── auth.controller.js
│   │   │   ├── post.controller.js
│   │   │   ├── comment.controller.js
│   │   │   ├── like.controller.js
│   │   │   └── notification.controller.js
│   │   ├── middleware/       # Express middleware
│   │   │   └── auth.middleware.js
│   │   ├── models/           # Mongoose schemas
│   │   │   ├── User.js
│   │   │   ├── Post.js
│   │   │   ├── Comment.js
│   │   │   ├── Like.js
│   │   │   └── Notification.js
│   │   ├── routes/           # API routes
│   │   ├── services/         # Business logic
│   │   │   ├── cache.service.js    # Redis caching
│   │   │   ├── rateLimit.service.js # Rate limiting
│   │   │   ├── queue.service.js    # BullMQ queues
│   │   │   └── pubsub.service.js   # Pub/Sub
│   │   ├── workers/          # Background job processors
│   │   │   └── notificationWorker.js
│   │   └── server.js         # Entry point
│   ├── .env                  # Environment variables
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/       # Reusable UI components
    │   │   ├── Navbar.jsx
    │   │   ├── PostCard.jsx
    │   │   ├── CommentSection.jsx
    │   │   └── CreatePost.jsx
    │   ├── context/          # React Context providers
    │   │   ├── AuthContext.jsx
    │   │   └── NotificationContext.jsx
    │   ├── pages/            # Page components
    │   │   ├── Login.jsx
    │   │   ├── Register.jsx
    │   │   ├── Feed.jsx
    │   │   ├── Profile.jsx
    │   │   └── Notifications.jsx
    │   ├── services/         # API services
    │   │   └── api.js
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    └── package.json
```

---

## 🔑 Key Concepts Explained

### 1. Redis Caching (Cache-Aside Pattern)

```
Read Flow:
1. Check Redis cache first
2. If found (cache hit) → return data
3. If not found (cache miss) → query MongoDB → store in cache → return

Write Flow:
1. Update MongoDB
2. Invalidate/update Redis cache
```

**Why?** Database queries are slow. Redis stores data in memory for ~1ms access times vs ~10-100ms for MongoDB.

**File:** `backend/src/services/cache.service.js`

### 2. Rate Limiting

```
Fixed Window Algorithm:
- Count requests in current time window
- Block if count exceeds limit
- Reset count when window expires

Example: 100 requests per minute per user
```

**Why?** Prevents abuse, protects against DDoS, ensures fair usage.

**File:** `backend/src/services/rateLimit.service.js`

### 3. BullMQ Job Queues

```
Flow:
1. Event occurs (new like/comment)
2. Add job to queue
3. Worker picks up job
4. Process asynchronously
5. Job completes
```

**Why?** Don't make users wait for notification creation. Process in background for better response times.

**File:** `backend/src/services/queue.service.js`

### 4. Redis Pub/Sub

```
Flow:
1. Server A publishes: "User X got a new like"
2. Redis broadcasts to all subscribers
3. Server B receives message
4. Server B emits via Socket.IO to User X
```

**Why?** Real-time notifications across multiple server instances.

**File:** `backend/src/services/pubsub.service.js`

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (local or Atlas)
- Redis (local or cloud)

### Installation

1. **Clone the repository**
```bash
cd RealtimeHub
```

2. **Setup Backend**
```bash
cd backend
npm install
```

3. **Configure Environment**
Create `backend/.env`:
```env
NODE_ENV=development
PORT=5000

# MongoDB
MONGODB_URI=mongodb://localhost:27017/realtimehub

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-key-change-this
JWT_EXPIRES_IN=7d

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000
```

4. **Setup Frontend**
```bash
cd ../frontend
npm install
```

5. **Start Development**

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

---

## 📝 API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/auth/register | Register new user |
| POST | /api/v1/auth/login | Login user |
| GET | /api/v1/auth/me | Get current user |

### Posts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/posts | Get feed posts |
| POST | /api/v1/posts | Create post |
| GET | /api/v1/posts/:id | Get single post |
| DELETE | /api/v1/posts/:id | Delete post |

### Comments
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/comments/post/:postId | Get post comments |
| POST | /api/v1/comments/post/:postId | Add comment |
| DELETE | /api/v1/comments/:id | Delete comment |

### Likes
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/v1/likes/toggle/:postId | Like/unlike post |

### Notifications
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/v1/notifications | Get notifications |
| GET | /api/v1/notifications/unread/count | Get unread count |
| PUT | /api/v1/notifications/read | Mark as read |
| PUT | /api/v1/notifications/read/all | Mark all as read |

---

## 🔍 Understanding the Code

Every file contains detailed comments explaining:
- **WHAT** the code does
- **WHY** we use it
- **HOW** it works

Look for these comment patterns:
```javascript
/**
 * LEARNING: Topic Name
 * 
 * Detailed explanation...
 */
```

---

## 🎯 Learning Path

1. **Start with databases**: Read `mongodb.js` and `redis.js`
2. **Understand models**: Study the Mongoose schemas
3. **Learn caching**: Deep dive into `cache.service.js`
4. **Explore rate limiting**: Check `rateLimit.service.js`
5. **Master queues**: Study `queue.service.js` and workers
6. **Real-time magic**: Understand `pubsub.service.js` + Socket.IO

---

## 📚 Resources

- [Redis Documentation](https://redis.io/docs/)
- [BullMQ Guide](https://docs.bullmq.io/)
- [Socket.IO Docs](https://socket.io/docs/)
- [Mongoose Docs](https://mongoosejs.com/docs/)
- [Express.js Guide](https://expressjs.com/en/guide/)

---

## 🤔 Common Questions

**Q: Why use Redis instead of in-memory cache?**
A: Redis persists data, works across server instances, and handles cache expiration automatically.

**Q: Why BullMQ over simple Redis pub/sub for jobs?**
A: BullMQ provides job persistence, retries, priorities, delayed jobs, and monitoring.

**Q: Why MongoDB + Redis instead of just one?**
A: MongoDB for persistent, complex queries. Redis for speed-critical operations.

---

## 📄 License

MIT License - Feel free to use this for learning!

---

Happy coding! 🎉
