#!/bin/bash
set -euo pipefail
SCENETRACK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$SCENETRACK_ROOT"
test -x .venv/bin/python || { echo 'Run scripts/setup.sh first.'; exit 1; }
.venv/bin/python -m pip install setuptools wheel torch==2.14.0 torchvision==0.29.0 hydra-core==1.3.6 iopath==0.1.10 tqdm==4.70.1
SAM2_BUILD_CUDA=0 .venv/bin/python -m pip install --no-build-isolation 'git+https://github.com/facebookresearch/sam2.git@2b90b9f5ceec907a1c18123530e92e794ad901a4'
mkdir -p models
if [ ! -s models/sam2.1_hiera_tiny.pt ]; then
  curl --fail --location --retry 3 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt' -o models/sam2.1_hiera_tiny.pt.partial
  mv models/sam2.1_hiera_tiny.pt.partial models/sam2.1_hiera_tiny.pt
fi
echo '7402e0d864fa82708a20fbd15bc84245c2f26dff0eb43a4b5b93452deb34be69  models/sam2.1_hiera_tiny.pt' | shasum -a 256 -c -
.venv/bin/python -c 'import torch; print("SAM installed. MPS GPU available:", torch.backends.mps.is_available())'
