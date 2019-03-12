.PHONY: clean build publish


watch_frontend:
	cd termpair/frontend_src && yarn start

build_frontend:
	cd termpair/frontend_src && yarn build

build: clean
	python -m pip install --upgrade --quiet setuptools wheel twine
	python setup.py --quiet sdist bdist_wheel

publish: build
	python -m twine upload dist/*

clean:
	rm -r build dist *.egg-info || true