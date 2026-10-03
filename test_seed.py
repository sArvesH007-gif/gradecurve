from contextlib import closing
import os
import secrets
import tempfile
import unittest
from pathlib import Path

import db


class SeedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_db_path = db.DB_PATH
        cls.test_db_path = Path(__file__).parent / f'test-gradecurve-{secrets.token_hex(8)}.db'
        db.DB_PATH = cls.test_db_path
        cls.demo_password = secrets.token_urlsafe(32)
        cls.previous_demo_password = os.environ.get('DEMO_PASSWORD')
        os.environ['DEMO_PASSWORD'] = cls.demo_password
        db.initialize()

    @classmethod
    def tearDownClass(cls):
        db.DB_PATH = cls.original_db_path
        if cls.previous_demo_password is None:
            os.environ.pop('DEMO_PASSWORD', None)
        else:
            os.environ['DEMO_PASSWORD'] = cls.previous_demo_password


    def test_demo_dataset_shape_and_accounts(self):
        with closing(db.connect()) as cx:
            self.assertEqual(cx.execute('SELECT COUNT(*) FROM students').fetchone()[0], 45)
            self.assertEqual(cx.execute('SELECT COUNT(*) FROM slots').fetchone()[0], 3)
            self.assertEqual(cx.execute('SELECT COUNT(*) FROM courses').fetchone()[0], 2)
            self.assertEqual(cx.execute("SELECT COUNT(*) FROM submissions WHERE status='pending'").fetchone()[0], 3)
            acct = cx.execute('SELECT password_hash FROM users WHERE username=?', ('24BCE0001',)).fetchone()
            self.assertTrue(db.verify_password(self.demo_password, acct[0]))
            self.assertFalse(db.verify_password(secrets.token_urlsafe(32), acct[0]))


if __name__ == '__main__':
    unittest.main()
