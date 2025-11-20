// Vercel 서버리스 함수로 Express 서버 래핑
const express = require('express');
const cors = require('cors');
const path = require('path');
const { existsSync, mkdirSync, readdirSync } = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);

// 상대 경로로 모듈 import (Vercel과 로컬 모두 지원)
let connectDB, Project, Visitor, Contact;

try {
  // Vercel: __dirname은 /var/task/api, ../server는 /var/task/server
  // 로컬: __dirname은 api/, ../server는 server/
  const dbModule = require('../server/config/database.cjs');
  connectDB = dbModule.connectDB;
  Project = require('../server/models/Project.cjs');
  Visitor = require('../server/models/Visitor.cjs');
  Contact = require('../server/models/Contact.cjs');
} catch (error) {
  console.error('❌ 모듈 로드 오류:', error.message);
  // Vercel 환경에서 다른 경로 시도
  if (isVercel) {
    try {
      const serverPath = path.join(process.cwd(), 'server');
      const dbModule = require(path.join(serverPath, 'config', 'database.cjs'));
      connectDB = dbModule.connectDB;
      Project = require(path.join(serverPath, 'models', 'Project.cjs'));
      Visitor = require(path.join(serverPath, 'models', 'Visitor.cjs'));
      Contact = require(path.join(serverPath, 'models', 'Contact.cjs'));
    } catch (fallbackError) {
      console.error('❌ 폴백 모듈 로드도 실패:', fallbackError.message);
    }
  }
}

const app = express();

// Vercel 서버리스 환경 감지
const isVercel = process.env.VERCEL === '1';

// 파일 경로 설정
// Vercel: __dirname은 /var/task/api를 가리킴
// 로컬: __dirname은 api/ 디렉토리를 가리킴

// 미들웨어
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
  'https://hyeyeon-portfolio.vercel.app',
  'https://hyeyeon57-hyeyeon-portfolio-admin.vercel.app',
  process.env.FRONTEND_URL || 'https://hyeyeon-portfolio.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // origin이 없으면 (같은 도메인 요청) 허용
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // 개발 중에는 모든 origin 허용
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 세션 설정 (Vercel 서버리스 환경에 맞게 MemoryStore 사용)
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'vibe-coding-portfolio-secret-key-2025',
  resave: false,
  saveUninitialized: false,
  name: 'admin.sid', // 세션 쿠키 이름
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24시간
    path: '/' // 모든 경로에서 쿠키 사용
  }
};

if (isVercel) {
  // Vercel 환경: MemoryStore 사용, secure 쿠키
  sessionConfig.store = new MemoryStore({
    checkPeriod: 86400000 // 24시간
  });
  sessionConfig.cookie.secure = true; // HTTPS만
  sessionConfig.cookie.sameSite = 'none'; // cross-site 쿠키 허용
} else {
  // 로컬 환경: 기본 메모리 스토어, HTTP 허용
  sessionConfig.cookie.secure = false;
  sessionConfig.cookie.sameSite = 'lax';
}

app.use(session(sessionConfig));

// 파일 업로드 설정 (Vercel에서는 /tmp 디렉토리 사용)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = '/tmp/projects'; // Vercel의 임시 디렉토리
    if (!existsSync(uploadPath)) {
      mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const originalName = file.originalname.replace(/\s+/g, '_');
    cb(null, `${timestamp}_${originalName}`);
  }
});

const upload = multer({ storage });

// 관리자 계정 정보
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'hing0915';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dpffla525';

// 환경 변수 로깅 (디버깅용)
console.log('🔧 환경 변수 확인:', {
  isVercel: isVercel,
  hasUsernameEnv: !!process.env.ADMIN_USERNAME,
  hasPasswordEnv: !!process.env.ADMIN_PASSWORD,
  usernameFromEnv: process.env.ADMIN_USERNAME || '(기본값 사용)',
  passwordFromEnv: process.env.ADMIN_PASSWORD ? '***설정됨***' : '(기본값 사용)',
  finalUsername: ADMIN_USERNAME,
  finalPasswordLength: ADMIN_PASSWORD.length,
  finalPasswordPreview: ADMIN_PASSWORD.substring(0, 2) + '***' + ADMIN_PASSWORD.substring(ADMIN_PASSWORD.length - 2)
});

// 로그인 체크 미들웨어
const requireAuth = (req, res, next) => {
  if (req.session && req.session.isAuthenticated) {
    return next();
  }
  res.redirect('/admin/login');
};

// 파일 경로 확인 함수
// Vercel: __dirname은 /var/task/api를 가리키므로 api/admin은 __dirname/admin
// 로컬: __dirname은 api/ 디렉토리를 가리키므로 server/admin은 __dirname/../server/admin
const getAdminFilePath = (filename) => {
  // Vercel 환경: api/admin 디렉토리 (api/index.js와 같은 레벨의 admin 디렉토리)
  if (isVercel) {
    const apiAdminPath = path.join(__dirname, 'admin', filename);
    if (existsSync(apiAdminPath)) {
      return apiAdminPath;
    }
    // 대체 경로 시도
    const altPath = path.join(process.cwd(), 'api', 'admin', filename);
    if (existsSync(altPath)) {
      return altPath;
    }
  } else {
    // 로컬 환경: server/admin 디렉토리
    const serverAdminPath = path.join(__dirname, '..', 'server', 'admin', filename);
    if (existsSync(serverAdminPath)) {
      return serverAdminPath;
    }
    // api/admin도 시도 (개발 중 복사본)
    const apiAdminPath = path.join(__dirname, 'admin', filename);
    if (existsSync(apiAdminPath)) {
      return apiAdminPath;
    }
  }
  
  return null;
};

// 정적 파일 서빙은 각 라우트에서 직접 처리

// 루트 경로 처리
app.get('/', (req, res) => {
  // 루트 경로는 관리자 로그인 페이지로 리다이렉트
  res.redirect('/admin/login');
});

// 백오피스 관리자 페이지 라우트
app.get('/admin/login', (req, res) => {
  if (req.session && req.session.isAuthenticated) {
    return res.redirect('/admin');
  }
  const loginPath = getAdminFilePath('login.html');
  if (loginPath) {
    res.sendFile(loginPath);
  } else {
    console.error('Login page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Login page not found.');
  }
});

app.get('/admin/viewer', (req, res) => {
  const adminIndexPath = getAdminFilePath('index.html');
  if (adminIndexPath) {
    res.sendFile(adminIndexPath);
  } else {
    console.error('Admin viewer page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Admin viewer page not found.');
  }
});

app.get('/admin', requireAuth, (req, res) => {
  const adminIndexPath = getAdminFilePath('index.html');
  if (adminIndexPath) {
    res.sendFile(adminIndexPath);
  } else {
    console.error('Admin page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Admin page not found.');
  }
});

app.get('/admin/create', requireAuth, (req, res) => {
  const createPath = getAdminFilePath('create.html');
  if (createPath) {
    res.sendFile(createPath);
  } else {
    console.error('Create page not found. __dirname:', __dirname, 'isVercel:', isVercel);
    res.status(404).send('Project creation page not found.');
  }
});

// API Routes
// 인증 API (로컬과 Vercel 모두 지원)
const registerApiRoute = (method, path, handler) => {
  app[method](path, handler);
  app[method](`/api/bo${path.replace('/api', '')}`, handler);
};

registerApiRoute('post', '/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔐 로그인 시도:', { 
      username, 
      passwordLength: password?.length,
      expectedUsername: ADMIN_USERNAME,
      expectedPasswordLength: ADMIN_PASSWORD.length,
      isVercel: isVercel
    });
    
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: '아이디와 비밀번호를 입력해주세요.' 
      });
    }
    
    // 정확한 비교 (공백 제거)
    const trimmedUsername = (username || '').trim();
    const trimmedPassword = (password || '').trim();
    const trimmedExpectedUsername = ADMIN_USERNAME.trim();
    const trimmedExpectedPassword = ADMIN_PASSWORD.trim();
    
    const usernameMatch = trimmedUsername === trimmedExpectedUsername;
    const passwordMatch = trimmedPassword === trimmedExpectedPassword;
    
    console.log('🔍 검증 결과:', { 
      usernameMatch, 
      passwordMatch,
      receivedUsername: trimmedUsername,
      expectedUsername: trimmedExpectedUsername,
      receivedPasswordLength: trimmedPassword.length,
      expectedPasswordLength: trimmedExpectedPassword.length,
      receivedPasswordPreview: trimmedPassword.substring(0, 2) + '***',
      expectedPasswordPreview: trimmedExpectedPassword.substring(0, 2) + '***',
      envPassword: process.env.ADMIN_PASSWORD ? '***설정됨***' : '(기본값)'
    });
    
    if (usernameMatch && passwordMatch) {
      req.session.isAuthenticated = true;
      req.session.username = trimmedUsername;
      console.log('✅ 로그인 성공:', trimmedUsername);
      console.log('🍪 세션 정보:', {
        sessionId: req.sessionID,
        isAuthenticated: req.session.isAuthenticated,
        username: req.session.username
      });
      
      // 세션 저장 확인
      req.session.save((err) => {
        if (err) {
          console.error('❌ 세션 저장 오류:', err);
        } else {
          console.log('✅ 세션 저장 완료');
        }
      });
      
      res.json({ success: true, message: '로그인 성공' });
    } else {
      console.warn('⚠️ 로그인 실패:', { 
        receivedUsername: trimmedUsername,
        expectedUsername: trimmedExpectedUsername,
        usernameMatch, 
        passwordMatch,
        receivedPasswordLength: trimmedPassword.length,
        expectedPasswordLength: trimmedExpectedPassword.length
      });
      res.status(401).json({ 
        success: false, 
        error: '아이디 또는 비밀번호가 올바르지 않습니다.' 
      });
    }
  } catch (error) {
    console.error('❌ 로그인 처리 오류:', error);
    res.status(500).json({ 
      success: false, 
      error: '로그인 처리 중 오류가 발생했습니다.' 
    });
  }
});

registerApiRoute('post', '/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: '로그아웃 실패' });
    }
    res.json({ success: true, message: '로그아웃 성공' });
  });
});

registerApiRoute('get', '/api/auth/check', (req, res) => {
  res.json({
    success: true,
    authenticated: req.session && req.session.isAuthenticated || false
  });
});

// MongoDB 연결 초기화
let dbConnected = false;
const initDB = async () => {
  if (!dbConnected) {
    dbConnected = await connectDB();
  }
  return dbConnected;
};

// 방문자 로그 API
registerApiRoute('post', '/api/visitors', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const { ip, userAgent, path: visitPath } = req.body;
    const clientIp = ip || req.ip || req.connection.remoteAddress;
    const clientUserAgent = userAgent || req.get('user-agent');
    const clientPath = visitPath || '/';
    const now = new Date();
    const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000);

    const existingVisit = await Visitor.findOne({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      date: { $gte: fiveSecondsAgo, $lt: now }
    });

    if (existingVisit) {
      await Visitor.updateOne(
        { _id: existingVisit._id },
        { $set: { date: now } }
      );
      return res.json({ success: true, message: '방문자 로그 업데이트 완료 (중복 방지)' });
    }

    await Visitor.create({
      ip: clientIp,
      userAgent: clientUserAgent,
      path: clientPath,
      date: now,
    });

    res.json({ success: true, message: '방문자 로그 저장 완료' });
  } catch (error) {
    console.error('❌ 방문자 로그 저장 오류:', error);
    res.json({ success: false, error: '방문자 로그 저장 실패' });
  }
});

registerApiRoute('get', '/api/visitors/stats', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: true,
        today: 0,
        total: 0
      });
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayCount = await Visitor.countDocuments({
      date: {
        $gte: today,
        $lt: tomorrow
      }
    });

    const todayCountCreatedAt = await Visitor.countDocuments({
      createdAt: {
        $gte: today,
        $lt: tomorrow
      }
    });

    const finalTodayCount = Math.max(todayCount, todayCountCreatedAt);
    const totalCount = await Visitor.countDocuments();

    res.json({
      success: true,
      today: finalTodayCount,
      total: totalCount
    });
  } catch (error) {
    console.error('❌ 방문자 통계 조회 오류:', error);
    res.json({
      success: true,
      today: 0,
      total: 0
    });
  }
});

registerApiRoute('get', '/api/visitors', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({
        success: false,
        error: 'MongoDB에 연결되지 않았습니다.'
      });
    }
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const visitors = await Visitor.find()
      .sort({ date: -1, createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const total = await Visitor.countDocuments();

    res.json({
      success: true,
      data: visitors,
      total: total,
      page: page,
      limit: limit
    });
  } catch (error) {
    console.error('❌ 방문자 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '방문자 목록을 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 목록 조회 (백오피스 API)
const handleGetProjects = async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다. MongoDB를 실행하거나 .env 파일에 MONGODB_URI를 설정하세요.'
      });
    }
    const projects = await Project.find().sort({ createdAt: -1 });
    res.json({ success: true, data: projects });
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트를 불러오는데 실패했습니다.' });
  }
};

// 프로젝트 목록 조회
registerApiRoute('get', '/api/projects', handleGetProjects);

// 프로젝트 상세 조회
registerApiRoute('get', '/api/projects/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (project) {
      res.json({ success: true, data: project });
    } else {
      res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }
  } catch (error) {
    console.error('프로젝트 조회 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트를 불러오는데 실패했습니다.' });
  }
});

// 프로젝트 생성
registerApiRoute('post', '/api/projects', upload.array('images', 9), async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    if (req.files && Array.isArray(req.files)) {
      // Vercel에서는 파일을 클라우드 스토리지에 업로드해야 함
      // 여기서는 경로만 저장 (실제 배포 시 S3 등 사용 권장)
      const imagePaths = req.files.map(file => `/tmp/projects/${file.filename}`);
      projectData.images = imagePaths;
    }
    if (!projectData.id) {
      projectData.id = Date.now().toString();
    }
    const newProject = await Project.create(projectData);
    res.json({ success: true, data: newProject });
  } catch (error) {
    console.error('프로젝트 생성 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 생성에 실패했습니다.' });
  }
});

// 프로젝트 수정
registerApiRoute('put', '/api/projects/:id', upload.array('images', 9), async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }

    const projectData = req.body.project ? JSON.parse(req.body.project) : req.body;
    if (req.files && Array.isArray(req.files) && req.files.length > 0) {
      const imagePaths = req.files.map(file => `/tmp/projects/${file.filename}`);
      projectData.images = [...(project.images || []), ...imagePaths];
    }
    projectData.id = project.id || req.params.id;

    const updatedProject = await Project.findOneAndUpdate(
      { _id: project._id },
      projectData,
      { new: true, runValidators: true }
    );

    res.json({ success: true, data: updatedProject });
  } catch (error) {
    console.error('프로젝트 수정 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 수정에 실패했습니다.' });
  }
});

// 프로젝트 삭제
registerApiRoute('delete', '/api/projects/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        error: 'MongoDB가 연결되지 않았습니다.'
      });
    }
    let project = await Project.findById(req.params.id);
    if (!project) {
      project = await Project.findOne({ id: req.params.id });
    }
    if (!project) {
      return res.status(404).json({ success: false, error: '프로젝트를 찾을 수 없습니다.' });
    }

    await Project.findByIdAndDelete(project._id);
    res.json({ success: true, message: '프로젝트가 삭제되었습니다.' });
  } catch (error) {
    console.error('프로젝트 삭제 오류:', error);
    res.status(500).json({ success: false, error: '프로젝트 삭제에 실패했습니다.' });
  }
});

// 연락처 API
registerApiRoute('post', '/api/contacts', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const { name, email, message } = req.body;
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: '이름, 이메일, 메시지를 모두 입력해주세요.' });
    }
    const newContact = await Contact.create({ name, email, message });
    res.json({ success: true, data: newContact });
  } catch (error) {
    console.error('연락처 저장 오류:', error);
    res.status(500).json({ success: false, error: '연락처 저장에 실패했습니다.' });
  }
});

registerApiRoute('get', '/api/contacts', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, data: contacts });
  } catch (error) {
    console.error('연락처 목록 조회 오류:', error);
    res.status(500).json({ success: false, error: '연락처 목록을 불러오는데 실패했습니다.' });
  }
});

registerApiRoute('put', '/api/contacts/:id/read', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contact = await Contact.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락처를 찾을 수 없습니다.' });
    }
    res.json({ success: true, data: contact });
  } catch (error) {
    console.error('연락처 읽음 처리 오류:', error);
    res.status(500).json({ success: false, error: '연락처 읽음 처리에 실패했습니다.' });
  }
});

registerApiRoute('delete', '/api/contacts/:id', async (req, res) => {
  try {
    await initDB();
    if (mongoose.connection.readyState !== 1) {
      return res.json({ success: false, error: 'MongoDB에 연결되지 않았습니다.' });
    }
    const contact = await Contact.findByIdAndDelete(req.params.id);
    if (!contact) {
      return res.status(404).json({ success: false, error: '연락처를 찾을 수 없습니다.' });
    }
    res.json({ success: true, message: '연락처가 삭제되었습니다.' });
  } catch (error) {
    console.error('연락처 삭제 오류:', error);
    res.status(500).json({ success: false, error: '연락처 삭제에 실패했습니다.' });
  }
});

// Vercel 서버리스 함수 핸들러
// Vercel 환경에서는 서버리스 함수로, 로컬에서는 Express 앱으로 동작
if (isVercel) {
  // Vercel 서버리스 함수 형식
  module.exports = (req, res) => {
    try {
      // CORS 헤더 추가
      const origin = req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      
      // Vercel에서 rewrite된 경로 처리
      // req.url은 원본 경로를 포함 (예: /admin, /admin/login, /api/bo/auth/login)
      // /api/bo/* 경로를 /api/*로 변환
      if (req.url && req.url.startsWith('/api/bo/')) {
        req.url = req.url.replace('/api/bo', '/api');
      }
      
      // Express 앱에 요청 전달
      return app(req, res);
    } catch (error) {
      console.error('❌ 서버리스 함수 오류:', error);
      res.status(500).json({ 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      });
    }
  };
} else {
  // 로컬 개발 환경
  module.exports = app;
}

