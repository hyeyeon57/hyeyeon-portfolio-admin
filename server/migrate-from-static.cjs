require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('./config/database.cjs');
const Project = require('./models/Project.cjs');
const { readFileSync } = require('fs');
const path = require('path');

// 정적 프로젝트 데이터를 MongoDB로 마이그레이션
const migrateStaticProjects = async () => {
  try {
    await connectDB();
    
    // src/data/portfolio.ts에서 프로젝트 데이터 가져오기
    // TypeScript 파일을 직접 읽을 수 없으므로, JSON 파일이 있으면 사용
    const projectsJsonPath = path.join(__dirname, '../data/projects.json');
    
    let projectsData = [];
    
    if (require('fs').existsSync(projectsJsonPath)) {
      projectsData = JSON.parse(readFileSync(projectsJsonPath, 'utf-8'));
      console.log(`📦 JSON 파일에서 ${projectsData.length}개의 프로젝트를 로드했습니다.`);
    } else {
      // JSON 파일이 없으면 portfolio.ts에서 직접 추출 (간단한 파싱)
      const portfolioPath = path.join(__dirname, '../src/data/portfolio.ts');
      if (require('fs').existsSync(portfolioPath)) {
        console.log('⚠️  portfolio.ts 파일을 직접 파싱할 수 없습니다.');
        console.log('💡 data/projects.json 파일을 생성하거나 수동으로 프로젝트를 추가하세요.');
        process.exit(1);
      }
    }
    
    if (projectsData.length === 0) {
      console.log('❌ 마이그레이션할 프로젝트 데이터가 없습니다.');
      process.exit(1);
    }
    
    console.log(`\n📦 ${projectsData.length}개의 프로젝트를 MongoDB로 마이그레이션합니다...\n`);
    
    const existingCount = await Project.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  기존 ${existingCount}개의 프로젝트가 MongoDB에 있습니다.`);
      console.log('기존 데이터를 유지하고 새 데이터를 추가합니다.\n');
    }
    
    let added = 0;
    let updated = 0;
    let skipped = 0;
    
    for (const projectData of projectsData) {
      try {
        // id로 기존 프로젝트 찾기
        const existing = await Project.findOne({ id: projectData.id });
        
        if (existing) {
          // 기존 프로젝트 업데이트
          await Project.findOneAndUpdate(
            { id: projectData.id },
            projectData,
            { new: true, runValidators: true }
          );
          console.log(`🔄 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 업데이트됨`);
          updated++;
        } else {
          // 새 프로젝트 추가
          await Project.create(projectData);
          console.log(`✅ 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 추가됨`);
          added++;
        }
      } catch (error) {
        console.error(`❌ 프로젝트 "${projectData.title}" (ID: ${projectData.id}) 처리 실패:`, error.message);
        skipped++;
      }
    }
    
    console.log(`\n✨ 마이그레이션 완료!`);
    console.log(`   추가: ${added}개`);
    console.log(`   업데이트: ${updated}개`);
    console.log(`   실패: ${skipped}개`);
    console.log(`\n💡 이제 BO에서 모든 프로젝트를 관리할 수 있습니다!`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ 마이그레이션 오류:', error);
    process.exit(1);
  }
};

migrateStaticProjects();

