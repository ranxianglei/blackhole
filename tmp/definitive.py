import mpmath as mp
mp.mp.dps = 30

def exact_deflection(b):
    b = mp.mpf(b)
    # r0: r^3 - b^2 r + 2 b^2 = 0, largest root > 2
    f = lambda r: r**3 - b**2*r + 2*b**2
    r0 = mp.findroot(f, b)  # start near b
    # alpha = 2*b * int_0^{u0} du / sqrt(1 - b^2 u^2 + 2 b^2 u^3) - pi, u0=1/r0
    u0 = 1/r0
    g = lambda u: b/mp.sqrt(1 - b**2*u**2 + 2*b**2*u**3)
    # singular at u0; substitute u = u0*sin(t), t in [0, pi/2)
    h = lambda t: g(u0*mp.sin(t))*u0*mp.cos(t)
    val = mp.quad(h, [0, mp.pi/2])
    return float(mp.degrees(2*val - mp.pi)), float(r0)

# simplified geodesic, high precision, start far
def simp_deflection(b, dt=mp.mpf('0.0005'), R=mp.mpf('400')):
    b=mp.mpf(b); R=mp.mpf(R)
    px,py = -R, b
    vx,vy = mp.mpf(1), mp.mpf(0)
    L2 = (px*vy-py*vx)**2
    def acc(px,py):
        r2 = px*px+py*py; r = mp.sqrt(r2)
        c = -3*L2/(r2*r2*r)  # -3L2/r^4, times (px,py)/r -> -3L2*(px,py)/r^5
        return c*px, c*py
    def step(px,py,vx,vy,dt):
        ax,ay = acc(px,py)
        k1x,k1y = vx,vy
        k1ax,k1ay = ax,ay
        ax2,ay2 = acc(px+0.5*dt*k1x, py+0.5*dt*k1y)
        k2x,k2y = vx+0.5*dt*k1ax, vy+0.5*dt*k1ay
        k2ax,k2ay = ax2,ay2
        ax3,ay3 = acc(px+0.5*dt*k2x, py+0.5*dt*k2y)
        k3x,k3y = vx+0.5*dt*k2ax, vy+0.5*dt*k2ay
        k3ax,k3ay = ax3,ay3
        ax4,ay4 = acc(px+dt*k3x, py+dt*k3y)
        k4x,k4y = vx+dt*k3ax, vy+dt*k3ay
        k4ax,k4ay = ax4,ay4
        px += dt/6*(k1x+2*k2x+2*k3x+k4x)
        py += dt/6*(k1y+2*k2y+2*k3y+k4y)
        vx += dt/6*(k1ax+2*k2ax+2*k3ax+k4ax)
        vy += dt/6*(k1ay+2*k2ay+2*k3ay+k4ay)
        return px,py,vx,vy
    minr = mp.inf
    for i in range(2000000):
        r = mp.sqrt(px*px+py*py); minr=min(minr,r)
        if r < 2: return None, float(minr), True
        if r > R*1.05 and (px*vx+py*vy)>0: break
        px,py,vx,vy = step(px,py,vx,vy,dt)
    ang = mp.acos((vx)/mp.sqrt(vx*vx+vy*vy))  # angle from +x
    return float(mp.degrees(ang)), float(minr), False

for b in [10, 8, 6]:
    ea, er0 = exact_deflection(b)
    sa, smr, cap = simp_deflection(b)
    print(f"b={b}: exact={ea:9.4f} (r0={er0:.4f}) | simplified={sa:9.4f} (minr={smr:.4f})")
