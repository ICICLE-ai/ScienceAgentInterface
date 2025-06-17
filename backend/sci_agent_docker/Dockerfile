FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV PIP_ROOT_USER_ACTION=ignore
RUN apt-get update && apt-get install -y \
python3 \
python3-pip \
python3-venv \
python-is-python3 \
wget \
curl \
git \
build-essential \
libffi-dev \
libtiff-dev \
libxrender1 \
&& rm -rf /var/lib/apt/lists/*

RUN userdel -r ubuntu && \
    groupadd --gid 1000 sci-agent && \
    useradd --uid 1000 --gid 1000 --create-home --shell /bin/bash sci-agent && \
    python -m venv /venv && \
    chown -R 1000:1000 /venv

COPY --chown=1000:1000 ./preinstalled_requirements.txt /tmp/requirements.txt

USER sci-agent
ENV PATH="/venv/bin:$PATH"
RUN mkdir /home/sci-agent/.cache && \
    pip install -r /tmp/requirements.txt --no-cache-dir && rm /tmp/requirements.txt

CMD ["sleep", "infinity"]
