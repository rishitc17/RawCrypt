def text_to_binary(str):
    output = ""
    for char in str:
        output = f"{output}{format(ord(char), "08b")}"

    return output

def binary_to_byte_array(binary_str):
    byte_array = []
    for i in range(0, len(binary_str), 8):
        byte_array.append(binary_str[i:i+8])
    
    return(byte_array)

def binary_to_hex(binary_str):
    hex_bytes = []
    byte_array = binary_to_byte_array(binary_str)

    for byte in byte_array:
        decimal = int(byte, 2)
        hex_value = format(decimal, "02X")
        hex_bytes.append(hex_value)

    return " ".join(hex_bytes)

def hex_to_binary(hex_str):
    binary_bytes = []
    hex_array = hex_str.split()

    for hex_value in hex_array:
        decimal = int(hex_value, 16)
        binary = format(decimal, "08b")
        binary_bytes.append(binary)

    return "".join(binary_bytes)