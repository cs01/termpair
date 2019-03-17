#!/usr/bin/env python
# -*- coding: utf-8 -*-

# For a fully annotated version of this file and what it does, see
# https://github.com/pypa/sampleproject/blob/master/setup.py

# To upload this file to PyPI you must build it then upload it:
# python setup.py sdist bdist_wheel  # build in 'dist' folder
# python-m twine upload dist/*  # 'twine' must be installed: 'pip install twine'


import ast
import io
import re
import os
from setuptools import find_packages, setup

DEPENDENCIES = ["bocadillo>=0.13"]
EXCLUDE_FROM_PACKAGES = ["contrib", "docs", "tests*"]
CURDIR = os.path.abspath(os.path.dirname(__file__))

with io.open(os.path.join(CURDIR, "README.md"), "r", encoding="utf-8") as f:
    README = f.read()


def get_version():
    main_file = os.path.join(CURDIR, "termpair", "main.py")
    _version_re = re.compile(r"__version__\s+=\s+(?P<version>.*)")
    with open(main_file, "r", encoding="utf8") as f:
        match = _version_re.search(f.read())
        version = match.group("version") if match is not None else '"unknown"'
    return str(ast.literal_eval(version))


setup(
    name="termpair",
    version=get_version(),
    author="Chad Smith",
    author_email="grassfedcode@gmail.com",
    description="View and control remote terminals from your browser",
    long_description=README,
    long_description_content_type="text/markdown",
    url="https://github.com/cs01/termpair",
    packages=find_packages(exclude=EXCLUDE_FROM_PACKAGES),
    include_package_data=True,
    keywords=["terminal", "share", "broadcast", "pty", "websockets"],
    scripts=[],
    entry_points={"console_scripts": ["termpair=termpair.main:main"]},
    zip_safe=False,
    install_requires=DEPENDENCIES,
    test_suite="tests.test_project",
    python_requires=">=3.6",
    # license and classifier list:
    # https://pypi.org/pypi?%3Aaction=list_classifiers
    license="License :: OSI Approved :: MIT License",
    classifiers=[
        "Programming Language :: Python :: 3.6",
        "Operating System :: MacOS",
        "Operating System :: POSIX :: Linux",
        "Development Status :: 3 - Alpha",
    ],
)
