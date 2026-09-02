import numpy as np

def accel(p, L2):
    r = np.linalg.norm(p)
    return -3.0*L2*p/(r**5)

def rk4_step(p, v, dt, L2):
    k1p = v;                 k1v = accel(p, L2)
    k2p = v+0.5*dt*k1v;      k2v = accel(p+0.5*dt*k1p, L2)
    k3p = v+0.5*dt*k2v;      k3v = accel(p+0.5*dt*k2p, L2)
    k4p = v+dt*k3v;          k4v = accel(p+dt*k3p, L2)
    p = p + dt/6*(k1p+2*k2p+2*k3p+k4p)
    v = v + dt/6*(k1v+2*k2v+2*k3v+k4v)
    return p, v

def trace(b, dt=0.002, maxsteps=400000, rmax=200.0):
    # photon coming from x=-inf moving +x, impact parameter b (offset in y)
    p = np.array([-100.0, b, 0.0])
    v = np.array([1.0, 0.0, 0.0])
    L2 = np.dot(np.cross(p,v), np.cross(p,v))
    minr = 1e9
    captured = False
    for i in range(maxsteps):
        r = np.linalg.norm(p)
        minr = min(minr, r)
        if r < 2.0:
            captured = True; break
        if r > rmax and np.dot(p,v) > 0:
            break
        p, v = rk4_step(p, v, dt, L2)
    # deflection angle: initial dir (1,0,0), final dir v
    vhat = v/np.linalg.norm(v)
    ang = np.arccos(np.clip(np.dot(np.array([1,0,0.0]), vhat), -1, 1))
    return ang, minr, captured

print("b      deflection   4/b      minr    captured")
for b in [10, 8, 6, 5.5, 5.2, 5.196, 5.1, 5.0, 4.0, 3.0]:
    ang, minr, cap = trace(b)
    print(f"{b:5.3f}  {np.degrees(ang):8.4f}  {4.0/b:8.4f}  {minr:7.3f}  {cap}")
print()
print("critical impact parameter 3*sqrt(3) =", 3*np.sqrt(3))
