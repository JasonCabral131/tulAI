"""Gives a shell a real terminal for Tulai's in-chat terminal (term.js). Reads keystrokes on stdin and writes the terminal's output to stdout.
A resize arrives as the escape sequence ESC ] tulai;resize;COLS;ROWS BEL and is applied to the terminal, never typed."""
import os, pty, sys, select, struct, fcntl, termios, signal, re
cols, rows, argv = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3:]
pid, fd = pty.fork()
if pid == 0:
    os.execvp(argv[0], argv)
def size(c, r): fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', r, c, 0, 0))
size(cols, rows)
RESIZE = re.compile(rb'\x1b\]tulai;resize;(\d+);(\d+)\x07')
inp, out = sys.stdin.buffer.fileno(), sys.stdout.buffer
while True:
    try: r, _, _ = select.select([fd, inp], [], [])
    except InterruptedError: continue
    if fd in r:
        try: data = os.read(fd, 65536)
        except OSError: break
        if not data: break
        out.write(data); out.flush()
    if inp in r:
        data = os.read(inp, 65536)
        if not data: os.kill(pid, signal.SIGHUP); break
        for m in RESIZE.finditer(data): size(int(m.group(1)), int(m.group(2))); os.kill(pid, signal.SIGWINCH)
        data = RESIZE.sub(b'', data)
        if data: os.write(fd, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status) if hasattr(os, 'waitstatus_to_exitcode') else 0)
