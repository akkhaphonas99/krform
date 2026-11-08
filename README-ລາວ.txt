ວິທີ Deploy ຂຶ້ນ Vercel (ບໍ່ໃຊ້ GitHub)
=======================================
ບໍ່ຕ້ອງໃຊ້ລະຫັດຜ່ານ — ທຸກຄົນທີ່ມີລິ້ງເບິ່ງ/ບັນທຶກ/ລົບປະຫວັດໄດ້
(ຖ້າຢາກເປີດລະຫັດຜ່ານພາຍຫຼັງ: Vercel → Settings → Environment Variables ເພີ່ມ APP_PASSWORD ແລ້ວ Redeploy)

ຕ້ອງມີ: Node.js (https://nodejs.org ເລືອກ LTS) ແລະບັນຊີ Vercel (ຟຣີ)

ຂັ້ນຕອນທີ 1: Deploy
  cd vercel-print-app
  npm install -g vercel
  vercel login
  vercel --prod
  - Set up and deploy?                     → Y
  - Link to existing project?              → N
  - Project name                           → ຕັ້ງຊື່ (ອັງກິດຕົວນ້ອຍ ເຊັ່ນ krfrom-print-lao)
  - In which directory is your code?       → ./  (ກົດ Enter)
  - ຖ້າຖາມ override settings               → N

ຂັ້ນຕອນທີ 2: ເຊື່ອມຖານຂໍ້ມູນ (ຕ້ອງເຮັດ ບໍ່ດັ່ງນັ້ນບັນທຶກບໍ່ໄດ້)
  1. ເຂົ້າ vercel.com → ເລືອກ project → ແທັບ Storage
  2. Create Database → ເລືອກ "Upstash for Redis" (ແຜນ Free) → ຕັ້ງຊື່ → Create
  3. ເຊື່ອມຕໍ່ເຂົ້າ project ນີ້ (Connect Project) ເລືອກທຸກ environment
     (Vercel ຈະໃສ່ KV_REST_API_URL ແລະ KV_REST_API_TOKEN ໃຫ້ອັດຕະໂນມັດ)

ຂັ້ນຕອນທີ 3: Deploy ອີກຄັ້ງ ໃຫ້ຄ່າຖານຂໍ້ມູນມີຜົນ
  vercel --prod

ຈາກນັ້ນເປີດລິ້ງ .vercel.app → ກົດບັນທຶກ/ເປີດແທັບປະຫວັດໄດ້ເລີຍ
ຖ້າຂຶ້ນ "ຍັງບໍ່ໄດ້ເຊື່ອມຖານຂໍ້ມູນ Redis" = ຂ້າມຂັ້ນຕອນ 2 ຫຼື 3
