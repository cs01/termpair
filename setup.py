#!/usr/bin/env python

import ast
import io
import re
import os
from setuptools import find_packages, setup  # type: ignore
import distutils.text_file

EXCLUDE_FROM_PACKAGES = ["contrib", "docs", "tests*"]
CURDIR = os.path.abspath(os.path.dirname(__file__))

with io.open(os.path.join(CURDIR, "README.md"), "r", encoding="utf-8") as f:
    README = f.read()


def get_version():
    main_file = os.path.join(CURDIR, "termpair", "constants.py")
    _version_re = re.compile(r"TERMPAIR_VERSION\s+=\s+(?P<version>.*)")
    with open(main_file, "r", encoding="utf8") as f:
        match = _version_re.search(f.read())
        version = match.group("version") if match is not None else '"unknown"'
    return str(ast.literal_eval(version))


setup(
    name="termpair",
    version=get_version(),
    author="Chad Smith",
    author_email="chadsmith.software@gmail.com",
    description="View and control remote terminals from your browser with end-to-end encryption",
    long_description=README,
    long_description_content_type="text/markdown",
    url="https://github.com/cs01/termpair",
    packages=find_packages(exclude=EXCLUDE_FROM_PACKAGES),
    include_package_data=True,
    keywords=["e2ee", "secure", "terminal", "share", "broadcast", "pty", "websockets"],
    scripts=[],
    entry_points={"console_scripts": ["termpair=termpair.main:main"]},
    zip_safe=False,
    install_requires=distutils.text_file.TextFile(
        filename="./requirements.txt"
    ).readlines(),
    python_requires=">=3.6",
    # license and classifier list:
    # https://pypi.org/pypi?%3Aaction=list_classifiers
    license="License :: OSI Approved :: MIT License",
    classifiers=[
        "Programming Language :: Python :: 3.6",
        "Operating System :: MacOS",
        "Operating System :: POSIX :: Linux",
        "Development Status :: 4 - Beta",
    ],
)
