FROM python:alpine3.15
COPY . /app
WORKDIR /app
RUN pip3 install -r requirement.txt
USER 1000:1000
CMD ["python3", "main.py"]
