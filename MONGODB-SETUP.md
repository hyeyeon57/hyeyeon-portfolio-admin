# MongoDB 연결 설정 가이드

## 현재 설정

백오피스 프로젝트에서 MongoDB 연결은 `.env` 파일의 `MONGODB_URI` 환경 변수로 설정됩니다.

기본값: `mongodb://localhost:27017/vibe-coding-portfolio`

## 방법 1: MongoDB Atlas 사용 (추천) ⭐

### 장점
- 무료 티어 제공 (512MB)
- 설치 불필요
- 클라우드에서 자동 관리
- 어디서나 접근 가능

### 설정 단계

1. **MongoDB Atlas 계정 생성**
   ```
   https://www.mongodb.com/cloud/atlas
   ```
   - "Try Free" 클릭하여 무료 계정 생성

2. **클러스터 생성**
   - "Build a Database" 클릭
   - "Free" 플랜 선택 (M0)
   - 클라우드 및 리전 선택 (예: `Seoul (ap-northeast-2)`)
   - 클러스터 이름 설정
   - "Create" 클릭

3. **데이터베이스 사용자 생성**
   - "Database Access" 메뉴로 이동
   - "Add New Database User" 클릭
   - Username과 Password 설정 (기억해두세요!)
   - Database User Privileges: "Atlas admin" 선택
   - "Add User" 클릭

4. **네트워크 액세스 설정**
   - "Network Access" 메뉴로 이동
   - "Add IP Address" 클릭
   - "Allow Access from Anywhere" 선택 (0.0.0.0/0) - 개발용
   - "Confirm" 클릭

5. **연결 문자열 가져오기**
   - "Database" 메뉴로 이동
   - "Connect" 버튼 클릭
   - "Connect your application" 선택
   - Driver: "Node.js" 선택
   - 연결 문자열 복사
   - 예: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`

6. **`.env` 파일 설정**
   ```
   MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/vibe-coding-portfolio?retryWrites=true&w=majority
   ```
   - `<password>`를 실제 비밀번호로 변경
   - 데이터베이스 이름 `vibe-coding-portfolio` 추가

## 방법 2: 로컬 MongoDB 설치

### Windows 설치

1. **MongoDB Community Edition 다운로드**
   ```
   https://www.mongodb.com/try/download/community
   ```
   - Windows용 MSI 설치 파일 다운로드

2. **MongoDB 설치**
   - 설치 마법사를 따라 설치
   - "Install MongoDB as a Service" 선택 (권장)

3. **MongoDB 서비스 확인 및 시작**
   ```powershell
   # 서비스 확인
   Get-Service -Name "*mongo*"
   
   # 서비스 시작 (필요한 경우)
   Start-Service MongoDB
   ```

4. **`.env` 파일 설정**
   ```
   MONGODB_URI=mongodb://localhost:27017/vibe-coding-portfolio
   ```
   - 기본값이므로 별도 설정 불필요 (MongoDB가 실행 중이면 자동 연결)

## .env 파일 생성

백오피스 프로젝트 루트에 `.env` 파일을 생성하고 다음 내용 추가:

```env
# MongoDB 연결
MONGODB_URI=mongodb://localhost:27017/vibe-coding-portfolio
# 또는 MongoDB Atlas 사용 시:
# MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/vibe-coding-portfolio?retryWrites=true&w=majority

# 백오피스 설정
PORT=3005
ADMIN_USERNAME=hing0915
ADMIN_PASSWORD=dpffla525!
SESSION_SECRET=vibe-coding-portfolio-secret-key-2025
```

## Vercel 환경 변수 설정

Vercel 배포 시 환경 변수를 설정해야 합니다:

1. **Vercel Dashboard 접속**
   ```
   https://vercel.com/dashboard
   ```

2. **프로젝트 선택**
   - `hyeyeon-portfolio-admin` 프로젝트 클릭

3. **Settings → Environment Variables**
   - Settings 탭 클릭
   - Environment Variables 섹션으로 이동

4. **환경 변수 추가**
   - `MONGODB_URI`: MongoDB 연결 문자열
   - `ADMIN_USERNAME`: 관리자 아이디
   - `ADMIN_PASSWORD`: 관리자 비밀번호
   - `SESSION_SECRET`: 세션 시크릿 키

5. **각 환경에 적용**
   - Production, Preview, Development에 체크
   - Save 클릭

## 연결 확인

서버를 실행하면 자동으로:
1. MongoDB 연결 시도
2. 연결 성공 시: `✅ MongoDB 연결 성공: [호스트명]`
3. 연결 실패 시: `❌ MongoDB 연결 실패: [에러 메시지]`

### 로컬에서 테스트

```bash
cd Hyeyeon-Portfolio-Admin
npm run dev
```

### 연결 성공 메시지
```
✅ MongoDB 연결 성공: localhost
```

### 연결 실패 메시지
```
❌ MongoDB 연결 실패: [에러 메시지]
⚠️  MongoDB가 실행되지 않았거나 연결 정보가 잘못되었습니다.
💡 MongoDB를 설치하고 실행하거나, MongoDB Atlas를 사용하세요.
```

## 문제 해결

### MongoDB Atlas 연결 실패
- 네트워크 액세스에 IP 주소가 허용되어 있는지 확인
- 사용자명과 비밀번호가 올바른지 확인
- 연결 문자열에 데이터베이스 이름이 포함되어 있는지 확인
- 비밀번호에 특수문자가 있으면 URL 인코딩 필요

### 로컬 MongoDB 연결 실패
- MongoDB 서비스가 실행 중인지 확인: `Get-Service MongoDB`
- 포트 27017이 사용 중인지 확인
- `.env` 파일이 올바른 위치에 있는지 확인

## 참고

- MongoDB Atlas 무료 티어: 512MB 저장공간
- 로컬 MongoDB: 무제한 (하드디스크 용량에 따라)
- 현재 데이터베이스 이름: `vibe-coding-portfolio`

