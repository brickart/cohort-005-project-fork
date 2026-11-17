/**
 * The Lesson page's reads and writes for the course, its curriculum and the
 * Student's progress through it. Moved out of the route as it was.
 */
export {
  calculateWatchProgress,
  flattenCourseLessons,
  getCourseWithDetails,
  getLastWatchPosition,
  getLessonById,
  getLessonProgress,
  getLessonProgressForCourse,
  getModuleById,
  getUserById,
  markLessonComplete,
  markLessonInProgress,
} from "./lib/course.server";
