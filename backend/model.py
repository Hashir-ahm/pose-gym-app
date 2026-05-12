import torch
import torch.nn as nn


class ResidualBlock(nn.Module):
    def __init__(self, h=1024, p=0.5):
        super().__init__()
        self.block = nn.Sequential(
            nn.Linear(h, h), nn.BatchNorm1d(h), nn.ReLU(True), nn.Dropout(p),
            nn.Linear(h, h), nn.BatchNorm1d(h),
        )
        self.act = nn.ReLU(True)

    def forward(self, x):
        return self.act(self.block(x) + x)


class MultiViewLiftingMLP(nn.Module):
    """136 → [1024 × 4 ResBlocks] → 51"""
    def __init__(self, in_dim=136, hidden=1024, out_dim=51):
        super().__init__()
        self.entry = nn.Sequential(
            nn.Linear(in_dim, hidden),
            nn.BatchNorm1d(hidden),
            nn.ReLU(True),
            nn.Dropout(0.5),
        )
        self.res  = nn.ModuleList([ResidualBlock(hidden) for _ in range(4)])
        self.head = nn.Linear(hidden, out_dim)

    def forward(self, x):
        x = self.entry(x)
        for blk in self.res:
            x = blk(x)
        return self.head(x)


def load_model(weights_path: str, device: str = "cpu") -> MultiViewLiftingMLP:
    model = MultiViewLiftingMLP()
    model.load_state_dict(torch.load(weights_path, map_location=device))
    model.to(device)
    model.eval()
    return model
