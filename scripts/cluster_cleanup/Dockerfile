FROM python:3.9-slim

WORKDIR /app

COPY requirements.txt /app

RUN pip install --trusted-host pypi.python.org -r requirements.txt

COPY cluster_cleanup.py /app

CMD ["python", "cluster_cleanup.py"]
