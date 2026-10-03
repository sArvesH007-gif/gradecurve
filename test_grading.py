import unittest
import grading

class GradingTests(unittest.TestCase):
    def test_statistics(self):
        self.assertEqual(grading.calculate_mean([1,2,3]),2)
        self.assertAlmostEqual(grading.calculate_standard_deviation([1,2,3]),0.81649658,places=6)
    def test_z_and_trajectory(self):
        self.assertEqual(grading.calculate_z_score(15,10,5),1)
        self.assertEqual(grading.get_grade_trajectory(1.5),'S Grade Trajectory')
        self.assertEqual(grading.get_grade_trajectory(-.1),'Needs Focus')
    def test_predictor(self):
        self.assertEqual(grading.calculate_target_score(30,10,'A'),40)
        self.assertEqual(grading.calculate_required_fat_score(20,45,.5)['score'],50)
        self.assertIn('outside',grading.calculate_required_fat_score(0,60,.5)['status'])
    def test_outlier_and_empty_data(self):
        self.assertFalse(grading.detect_outlier(10,[]))
        self.assertTrue(grading.detect_outlier(100,[10,11,12,13]))
        self.assertIsNone(grading.calculate_mean([]))

if __name__=='__main__': unittest.main()
