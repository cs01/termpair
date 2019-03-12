import fcntl
import struct
import termios
from contextlib import contextmanager
import tty
import random
import string

max_read_bytes = 1024 * 20


def get_terminal_size(fd):
    data = fcntl.ioctl(fd, termios.TIOCGWINSZ, b"\x00\x00\00\x00")
    rows, cols = struct.unpack("hh", data)
    return rows, cols


def set_terminal_size(fd, rows, cols):
    xpix = ypix = 0
    winsize = struct.pack("HHHH", rows, cols, xpix, ypix)
    fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)


def copy_terminal_dimensions(src_fd, dest_fd):
    rows, cols = get_terminal_size(src_fd)
    set_terminal_size(dest_fd, rows, cols)


@contextmanager
def make_raw(fd):
    mode = None
    try:
        mode = tty.tcgetattr(fd)
        tty.setraw(fd)
        yield
    except tty.error:
        pass
    except Exception as e:
        print(e)
    if mode:
        tty.tcsetattr(fd, tty.TCSAFLUSH, mode)


def get_random_string(n):
    return "".join(random.choices(string.ascii_letters + string.digits, k=n))
