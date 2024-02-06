

import csv
import time

import paramiko

USERNAME="myshake"
PASSWORD= "shakeme"

failed_list = []
success_list =[]

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

            # Send the sudo command and password
            # channel.send(f'echo {PASSWORD} | sudo -S apt update\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt upgrade -y\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt install -y python3-pip -y\n')
            # channel.send(f'echo {PASSWORD} | sudo -S pip3 install numpy\n')
            # channel.send(f'echo {PASSWORD} | sudo -S pip3 install obspy\n')
            # channel.send(f'echo {PASSWORD} | sudo -S pip3 install --upgrade\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt install -y libatlas-base-dev\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt remove -y gpsd\n')
            # channel.send(f'echo {PASSWORD} | sudo -S dpkg --configure -a\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt install -y libwebp6 libtiff5 libjbig0 liblcms2-2 libwebpmux3 libopenjp2-7 libzstd1 libwebpdemux2\n')
            # channel.send(f'echo {PASSWORD} | sudo -S apt install -y libxslt-dev\n')
            total_out = ""
            _, std_out, std_out = ssh.exec_command(f'sudo apt update')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo apt upgrade -y')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =   ssh.exec_command(f'sudo apt install -y python3-pip')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo python3 -m pip install numpy')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo python3 -m pip install obspy')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo python3 -m pip install --upgrade')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo apt install -y libatlas-base-dev')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =   ssh.exec_command(f'sudo apt remove -y gpsd')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =   ssh.exec_command(f'sudo dpkg --configure -a')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =   ssh.exec_command(f'sudo apt install -y libwebp6 libtiff5 libjbig0 liblcms2-2 libwebpmux3 libopenjp2-7 libzstd1 libwebpdemux2')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)
            _, std_out, __ =  ssh.exec_command(f'sudo apt install -y libxslt-dev')
            std_out.channel.set_combine_stderr(True)
            lines = "\n".join(std_out.readlines())
            total_out += lines
            print(lines)

            print("Install done. Testing...")
            
#             install_ssh_stdin, install_ssh_stdout, install_ssh_stderr = ssh.exec_command("""sudo apt update &&
# sudo apt install -y python3-pip &&
# sudo pip3 install numpy &&
# sudo pip3 install obspy &&
# sudo pip3 install --upgrade
# sudo apt install -y libatlas-base-dev &&
# sudo apt remove -y gpsd &&
# sudo dpkg --configure -a &&
# sudo apt install -y libwebp6 libtiff5 libjbig0 liblcms2-2 libwebpmux3 libopenjp2-7 libzstd1 libwebpdemux2 &&
# sudo apt install -y libxslt-dev""", get_pty = True)
#             print("E")
#             # Input sudo password
#             install_ssh_stdin.write(PASSWORD + '\n')
#             install_ssh_stdin.flush()
#             print("a")
#             install_ssh_stdout.channel.set_combine_stderr(True)
#             print("\n".join(install_ssh_stdout.readlines()))
#             print("sports")
#             print("Install done. Testing...")

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
            print(err)
            failed_list.append([id, ip, err])
        finally:
            ssh.close()
            print("Continuing...")

print("Success:\n", "\n".join(success_list))
print("Failed:\n", "\n".join(failed_list))