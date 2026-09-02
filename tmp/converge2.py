import numpy as np
def accel(p, L2):
    r = np.linalg.norm(p); return -3.0*L2*p/(r**5)
def rk4(p, v, dt, L2):
    k1p=v; k1v=accel(p,L2)
    k2p=v+0.5*dt*k1v; k2v=accel(p+0.5*dt*k1p,L2)
    k3p=v+0.5*dt*k2v; k3v=accel(p+0.5*dt*k2p,L2)
    k4p=v+dt*k3v; k4v=accel(p+dt*k3p,L2)
    return p+dt/6*(k1p+2*k2p+2*k3p+k4p), v+dt/6*(k1v+2*k2v+2*k3v+k4v)
def trace(b, dt, maxsteps=300000, rmax=250.0):
    p=np.array([-80.0,b,0.0]); v=np.array([1.0,0.0,0.0])
    L2=np.dot(np.cross(p,v),np.cross(p,v)); minr=1e9
    for i in range(maxsteps):
        r=np.linalg.norm(p); minr=min(minr,r)
        if r<2.0: return None, minr, True
        if r>rmax and np.dot(p,v)>0: break
        p,v=rk4(p,v,dt,L2)
    vhat=v/np.linalg.norm(v)
    return np.degrees(np.arccos(np.clip(np.dot([1,0,0.0],vhat),-1,1))), minr, False
print("b=10 (exact 31.53):")
for dt in [0.002, 0.001, 0.0005]:
    a,mr,cap = trace(10.0, dt)
    print(f"   dt={dt:7}  defl={a:8.4f}  minr={mr:.4f}")
