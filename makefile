.PHONY: clean build publish docs

install_frontend:
	pushd . && cd termpair/frontend_src && yarn install && popd

watch_frontend:
	pushd . && cd termpair/frontend_src && yarn start && popd

build_frontend:
	pushd . && cd termpair/frontend_src && yarn build && popd

build: clean
	python -m pip install --upgrade --quiet setuptools wheel twine
	python setup.py --quiet sdist bdist_wheel

publish: build
	python -m twine upload dist/*

clean:
	rm -r build dist *.egg-info || true
