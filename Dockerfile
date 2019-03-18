FROM python:3.6

ENV PYTHONUNBUFFERED=1
ENV ROOT=/usr/src/app

WORKDIR ${ROOT}
RUN curl https://bootstrap.pypa.io/get-pip.py | python3.6
ADD . ${ROOT}
RUN python -m pip install .
RUN pip install gunicorn
CMD ["gunicorn", "-k", "uvicorn.workers.UvicornWorker", "-b", "0.0.0.0:8000", "termpair.server:app"]