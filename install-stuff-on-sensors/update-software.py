

import csv
import time

import paramiko

USERNAME="myshake"
PASSWORD= "shakeme"

failed_list = []
success_list =[]

commands = [
  "sudo apt update -y",
  "sudo apt install python3-pip -y",
  "sudo pip3 install --upgrade pip setuptools wheel -y",
  "pip3 install numpy -y",
  "pip3 install obspy -y",
  "pip3 install --upgrade --force-reinstall scipy -y",
  "sudo apt-get install libatlas-base-dev -y",
  "sudo apt remove gpsd -y",
  "sudo dpkg --configure -a -y",
  "sudo pip3 install dpkg -y",
  "sudo apt install libwebp6 libtiff5 libjbig0 liblcms2-2 libwebpmux3 libopenjp2-7 libzstd1 libwebpdemux2 -y",
  "sudo apt-get install libxslt-dev -y",
]

with open("rs4d-sensor-ips.csv") as f:
    data = csv.reader(f)
    for row in data:
        id = row[0]
        ip = row[1]
        ssh = paramiko.SSHClient()

        try:
          
            print(f"Updating #{id}...")
            ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            print(f"Connecting to {ip} via SSH...")
            ssh.connect(ip, username=USERNAME, password=PASSWORD, timeout=15, disabled_algorithms={'keys': ['rsa-sha2-256', 'rsa-sha2-512']})
            print(f"Connected, running install...")

            total_out = ""
            for command in commands:
                _, std_out, std_out = ssh.exec_command(command, timeout=60)
                std_out.channel.set_combine_stderr(True)
                lines = "\n".join(std_out.readlines())
                total_out += lines
                print(lines)

            print("Install done. Testing...")

            test_ssh_stdin, test_ssh_stdout, test_ssh_stderr = ssh.exec_command("""c=`cat <<EOF
import socket as s
from obspy.core import read
from collections import deque
import numpy as np
import os
from datetime import datetime


################################IP address and the Port number of the sensor ###############################
host = ''
port = 50333


###############################################################################




# UDP socket connection
sock = s.socket(s.AF_INET, s.SOCK_DGRAM)
sock.setsockopt(s.SOL_SOCKET, s.SO_REUSEADDR, 1)
sock.bind((host, port))



data, addr = sock.recvfrom(1024)  # wait to receive data
s = data.decode('UTF-8').strip("'{}").split(', ')  # clean and listify the dat
print("received data:" , s)
EOF`
python3 -c "$c"
""",timeout=30)
            print("\n".join(test_ssh_stdout.readlines()))
            errors = "\n".join(test_ssh_stderr.readlines()).strip()
            print(errors)
            if len(errors) == 0:
                print(f"Sensor #{id} set up successfully!")
                success_list.append(row)
            else:
                print(f"Failed to set up #{id} correctly")
                failed_list.append([id, ip, errors, total_out])


        except Exception as err:
            print(f"Error installing sensor #{id}")
            print(err.with_traceback(None))
            failed_list.append([id, ip, err])
        finally:
            ssh.close()
            print("Continuing...")

print("Success:\n", "\n".join(success_list))
print("Failed:\n", "\n".join(failed_list))