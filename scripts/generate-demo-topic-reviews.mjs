import { promises as fs } from "node:fs";
import path from "node:path";

const repository = path.resolve(process.argv[2] ?? "../tnp-getgo-quizzes");
const topicsRoot = path.join(repository, "content-v2", "topics");
const reviewCount = 24;

const names = [
  "Mai Anh Tuấn", "Nguyễn D. Phong", "Hồng Dương", "Trần Minh Anh", "Lê Gia Huy",
  "Phạm Khánh Linh", "Nguyễn Nhật Nam", "Đỗ Bảo Ngọc", "Vũ Minh Khang", "Hoàng Thùy An",
  "Trương Đức Anh", "Bùi Hải Yến", "Đặng Quang Minh", "Phan Ngọc Hà", "Nguyễn Thanh Tâm",
  "Lâm Tuệ Nhi", "Võ Anh Khoa", "Trần Bảo Châu", "Lê Minh Quân", "Ngô Phương Thảo",
  "Đinh Gia Bảo", "Huỳnh Khánh Vy", "Phạm Đức Long", "Nguyễn Hà My", "Vũ Hoàng Sơn",
  "Trần Kim Chi", "Lê Quốc Bảo", "Đỗ Minh Trang", "Nguyễn Anh Thư", "Phan Tuấn Kiệt",
];

const comments = [
  "Nội dung rõ ràng, con học rất hào hứng.",
  "Bài tập vừa sức và trình bày dễ hiểu.",
  "Chủ đề hữu ích để con luyện tập thêm ở nhà.",
  "Các câu hỏi đa dạng, phù hợp để ôn luyện.",
  "Con rất thích cách sắp xếp bài học.",
  "Phần luyện tập tốt, mong có thêm nhiều đề mới.",
  "Nội dung chất lượng và dễ theo dõi.",
  "Bài học giúp con tự tin hơn khi làm bài.",
  "Phù hợp với độ tuổi và chương trình của con.",
  "Các dạng bài được chọn khá hay.",
  "Con có thể tự học mà không cần hỗ trợ nhiều.",
  "Giao diện trực quan, bài tập thú vị.",
  "Rất hữu ích cho việc ôn tập cuối tuần.",
  "Mức độ khó hợp lý và có tính thử thách.",
  "Chất lượng câu hỏi tốt, sẽ tiếp tục sử dụng.",
  "Con luyện đều mỗi ngày và có tiến bộ.",
];

function hash(value) {
  let result = 2166136261;
  for (const character of value) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function reviewsFor(topicId) {
  const seed = hash(topicId);
  return Array.from({ length: reviewCount }, (_, index) => {
    const identity = `${topicId}-${String(index + 1).padStart(2, "0")}`;
    const dayOffset = (seed + index * 7) % 120;
    return {
      id: `demo-${identity}`,
      authorName: names[(seed + index * 11) % names.length],
      rating: index % 6 === 0 ? 4 : 5,
      comment: index % 3 === 2 ? "" : comments[(seed + index * 5) % comments.length],
      createdAt: new Date(Date.UTC(2026, 9, 12 - dayOffset, 2 + (index % 12), (seed + index * 13) % 60)).toISOString(),
      source: "demo",
    };
  });
}

const topicDirectories = (await fs.readdir(topicsRoot, { withFileTypes: true }))
  .filter(entry => entry.isDirectory())
  .sort((left, right) => left.name.localeCompare(right.name));

let updated = 0;
for (const directory of topicDirectories) {
  const filePath = path.join(topicsRoot, directory.name, "topic.json");
  try {
    const topic = JSON.parse(await fs.readFile(filePath, "utf8"));
    topic.marketplace = {
      ...(topic.marketplace ?? {}),
      demoReviews: reviewsFor(String(topic.id ?? directory.name)),
    };
    await fs.writeFile(filePath, `${JSON.stringify(topic, null, 2)}\n`, "utf8");
    updated += 1;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

console.info(`Generated ${reviewCount} demo reviews for ${updated} topics (${updated * reviewCount} total).`);
