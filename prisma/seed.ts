import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/db/generated/client";
import { ASSESSMENT_COMPONENTS } from "../lib/grading/assessment-components";

const connectionString = process.env.DATABASE_URL;
if (!connectionString)
  throw new Error("Set DATABASE_URL before seeding GradeCurve.");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});
const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword)
  throw new Error("Set DEMO_PASSWORD in .env.local before seeding demo accounts.");
const passwordHash = () => {
  const salt = randomBytes(16);
  const derived = pbkdf2Sync(demoPassword, salt, 310_000, 32, "sha256");
  return `${salt.toString("hex")}$${derived.toString("hex")}`;
};
const round = (value: number) => Math.round(value * 10) / 10;
const studentNames = [
  "Sarvesh Nair",
  "Priya Raman",
  "Aarav Menon",
  "Ananya Das",
  "Kabir Shah",
  "Isha Kapoor",
  "Rohan Iyer",
  "Mira Joshi",
  "Dev Patel",
  "Zoya Khan",
  "Arjun Rao",
  "Nisha Verma",
  "Vivaan Mehta",
  "Aditi Sen",
  "Rehan Ali",
];

async function main() {
  await prisma.$transaction([
    prisma.markVerification.deleteMany(),
    prisma.studyMatch.deleteMany(),
    prisma.guidanceAlert.deleteMany(),
    prisma.markSubmission.deleteMany(),
    prisma.attendance.deleteMany(),
    prisma.mark.deleteMany(),
    prisma.assessment.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.courseSlot.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.classSlot.deleteMany(),
    prisma.course.deleteMany(),
    prisma.teacherProfile.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const teacherSpecs = [
    { username: "dr.sharma@gradecurve.demo", name: "Dr. Meera Sharma" },
    { username: "ananya@gradecurve.demo", name: "Prof. Ananya Rao" },
  ];
  const teachers = [];
  for (const spec of teacherSpecs) {
    const user = await prisma.user.create({
      data: { ...spec, role: "TEACHER", passwordHash: passwordHash() },
    });
    teachers.push(
      await prisma.teacherProfile.create({ data: { userId: user.id } }),
    );
  }

  const courseSpecs = [
    { code: "CSE1004", name: "Network Essentials", teacherId: teachers[0].id },
    {
      code: "CSE1007",
      name: "Database Management Systems",
      teacherId: teachers[1].id,
    },
  ];
  const courses = [];
  for (const spec of courseSpecs)
    courses.push(await prisma.course.create({ data: spec }));

  const slotSpecs = ["L31+L32", "A1", "B2"];
  const slots = [];
  for (let i = 0; i < slotSpecs.length; i++) {
    slots.push(
      await prisma.classSlot.create({
        data: {
          name: slotSpecs[i],
          teacherId: teachers[i % teachers.length].id,
        },
      }),
    );
  }
  for (const course of courses) {
    for (const slot of slots)
      await prisma.courseSlot.create({
        data: { courseId: course.id, slotId: slot.id },
      });
  }

  const assessmentSpecs = ASSESSMENT_COMPONENTS;
  const assessmentByCourseAndName = new Map<
    string,
    { id: string; maxScore: number }
  >();
  for (const course of courses) {
    for (const assessment of assessmentSpecs) {
      const created = await prisma.assessment.create({
        data: { ...assessment, courseId: course.id },
      });
      assessmentByCourseAndName.set(
        `${course.code}:${assessment.name}`,
        created,
      );
    }
  }

  const studentIds: string[] = [];
  const attendanceRows: {
    studentId: string;
    courseId: string;
    date: Date;
    present: boolean;
  }[] = [];
  for (let i = 0; i < 45; i++) {
    const registrationNo = `24BCE${String(i + 1).padStart(4, "0")}`;
    const slot = slots[Math.floor(i / 15)];
    const user = await prisma.user.create({
      data: {
        username: registrationNo,
        name: studentNames[i % studentNames.length],
        role: "STUDENT",
        passwordHash: passwordHash(),
      },
    });
    const student = await prisma.studentProfile.create({
      data: { userId: user.id, registrationNo, activeSlotId: slot.id },
    });
    studentIds.push(student.id);

    for (const course of courses) {
      await prisma.enrollment.create({
        data: { studentId: student.id, courseId: course.id, slotId: slot.id },
      });
      const courseOffset = course.code === "CSE1004" ? 7 : 19;
      const sectionPosition = i % 15;
      const abilityPercent =
        sectionPosition >= 12 ? 18 : sectionPosition <= 2 ? -14 : 0;
      for (let component = 0; component < assessmentSpecs.length; component++) {
        const assessment = assessmentSpecs[component];
        const record = assessmentByCourseAndName.get(
          `${course.code}:${assessment.name}`,
        )!;
        if (assessment.name === "FAT" && i % 9 === 0) continue;
        const baselinePercent =
          35 + ((i * 17 + courseOffset + component * 13) % 45);
        const score = round(
          (assessment.maxScore *
            Math.min(100, Math.max(0, baselinePercent + abilityPercent))) /
            100,
        );
        await prisma.mark.create({
          data: { studentId: student.id, assessmentId: record.id, score },
        });
      }
      const absentCount = [4, 16, 36].includes(i)
        ? 4
        : (i * 3 + courseOffset) % 3;
      for (let day = 0; day < 12; day++) {
        attendanceRows.push({
          studentId: student.id,
          courseId: course.id,
          date: new Date(Date.UTC(2026, 7, 1 + day * 3)),
          present: day >= absentCount,
        });
      }
    }
  }
  await prisma.attendance.createMany({ data: attendanceRows });

  for (const i of [0, 9, 18, 27, 36]) {
    const assessment = assessmentByCourseAndName.get(`CSE1004:FAT`)!;
    const peerScores = [52, 61, 68, 74, 81];
    await prisma.markSubmission.create({
      data: {
        studentId: studentIds[i],
        assessmentId: assessment.id,
        score: 64 + (i % 4) * 5,
        peerScores,
        reason:
          "Student reported a fallback mark; awaiting faculty verification.",
        isOutlier: i === 36,
      },
    });
  }

  const requester = studentIds[0];
  const peer = studentIds[12];
  await prisma.studyMatch.create({
    data: {
      requesterId: requester,
      peerId: peer,
      courseId: courses[1].id,
      message: "Study group request for database normalization.",
    },
  });

  for (const i of [4, 16, 36]) {
    await prisma.guidanceAlert.create({
      data: {
        studentId: studentIds[i],
        teacherId: teachers[i % teachers.length].userId,
        courseId: courses[i % courses.length].id,
        message:
          "Please arrange a supportive check-in about recent progress and attendance.",
      },
    });
  }

  console.info(
    `Seeded ${45} students, ${courses.length} courses, ${slots.length} slots, and ${attendanceRows.length} attendance records.`,
  );
  console.info("Demo accounts seeded; sign in with the locally configured DEMO_PASSWORD.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
