.PHONY: clean build publish docs install_frontend

install_frontend:
	cd termpair/frontend_src && yarn install

watch_frontend: install_frontend
	cd termpair/frontend_src && yarn start

build_frontend: install_frontend
	cd termpair/frontend_src && yarn build

clean:
	rm -r build dist *.egg-info || true
