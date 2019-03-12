#!/usr/bin/env python
# -*- coding: utf-8 -*-

import unittest
import termpair


class UnitTests(unittest.TestCase):
    def test_import(self):
        self.assertIsNotNone(termpair)

    def test_project(self):
        self.assertTrue(False, "write more tests here")