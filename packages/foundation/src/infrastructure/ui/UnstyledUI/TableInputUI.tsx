import React from 'react'
import { IUIGateway } from '@domain/gateways/IUIGateway'

const TableInputUI: IUIGateway['TableInputUI'] = {
  container: ({ children }) => {
    return <>{children}</>
  },
  menu: ({ children }) => {
    return <>{children}</>
  },
  label: ({ label }) => {
    return <>{label}</>
  },
  addButton: ({ label, onClick }) => {
    return <button onClick={onClick}>{label}</button>
  },
  table: ({ children }) => {
    return <table>{children}</table>
  },
  header: ({ children }) => {
    return (
      <thead>
        <tr>{children}</tr>
      </thead>
    )
  },
  headerColumn: ({ label }) => {
    return <th>{label}</th>
  },
  rows: ({ children }) => {
    return <tbody>{children}</tbody>
  },
  row: ({ children }) => {
    return <tr>{children}</tr>
  },
  rowColumn: ({ name, placeholder, value, onChange }) => {
    return (
      <td>
        <input name={name} placeholder={placeholder} onChange={onChange} value={value} />
      </td>
    )
  },
}

export default TableInputUI
